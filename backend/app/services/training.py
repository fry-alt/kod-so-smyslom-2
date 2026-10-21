"""Обучение волонтёров: учебные модули из data/training/*.md, тест от LLM, проверка, статусы.

Файл модуля начинается с шапки:
    ---
    title: О фонде «Дети Марии»
    required: true
    ---
required: false — дополнительный модуль, на статус «обучение пройдено» не влияет.
Порядок модулей — по имени файла (01-…, 02-…), id модуля — имя файла без .md.

Тест по модулю LLM составляет один раз и сохраняет в QuizCache вместе с правильными ответами.
Если LLM недоступна — берём готовый тест из data/training/<id>.quiz.json (если он есть).
Чтобы перегенерировать тест (например, фонд поменял текст), удалите строку модуля из quizcache.
"""

import logging
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError, model_validator
from sqlalchemy import func
from sqlmodel import Session, select

from app.config import get_settings
from app.llm.client import get_llm
from app.llm.prompts import load_prompt
from app.llm.providers import LLMError
from app.models import QuizAttempt, QuizCache, Volunteer
from app.schemas import Quiz, QuizQuestion, QuizResult, TrainingModule
from app.services import notify, volunteer_index, volunteers

log = logging.getLogger(__name__)

PASS_SCORE = 70  # % правильных, чтобы модуль считался сданным
QUESTIONS = 5


class QuizItem(QuizQuestion):
    """Вопрос с правильным ответом — так его отдаёт LLM и так он лежит в QuizCache."""

    options: list[str] = Field(min_length=3, max_length=4)
    correct: int = Field(ge=0, description="номер правильного варианта в options, с нуля")

    @model_validator(mode="after")
    def _correct_is_an_option(self) -> "QuizItem":
        if self.correct >= len(self.options):
            raise ValueError("correct указывает на несуществующий вариант")
        return self


class GeneratedQuiz(BaseModel):
    questions: list[QuizItem] = Field(min_length=QUESTIONS, max_length=QUESTIONS)


def load_modules() -> list[TrainingModule]:
    folder = get_settings().data_dir / "training"
    return [_read(path) for path in sorted(folder.glob("*.md"))]


def get_module(module_id: str) -> TrainingModule | None:
    return next((m for m in load_modules() if m.id == module_id), None)


def _read(path: Path) -> TrainingModule:
    text = path.read_text(encoding="utf-8")
    meta: dict[str, str] = {}
    if text.startswith("---\n"):
        header, _, text = text.removeprefix("---\n").partition("\n---\n")
        for line in header.splitlines():
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
    return TrainingModule(
        id=path.stem,
        title=meta.get("title") or path.stem,
        text=text.strip(),
        required=meta.get("required", "true").lower() != "false",
    )


def get_quiz(session: Session, module: TrainingModule) -> list[QuizItem]:
    """Вопросы с правильными ответами: из кэша, иначе от LLM, иначе из готового файла."""
    cached = session.get(QuizCache, module.id)
    if cached:
        return [QuizItem.model_validate(q) for q in cached.questions]

    quiz = generate_quiz(module) or fallback_quiz(module.id)
    if quiz is None:
        raise LLMError("Не получилось составить тест, попробуйте чуть позже")
    session.add(QuizCache(module_id=module.id, questions=[q.model_dump() for q in quiz.questions]))
    session.commit()
    return quiz.questions


def generate_quiz(module: TrainingModule) -> GeneratedQuiz | None:
    prompt = load_prompt("quiz", title=module.title, text=module.text)
    try:
        return get_llm().chat_json(prompt, GeneratedQuiz, system=load_prompt("system"))
    except LLMError as e:
        log.warning("Тест по модулю %s не составлен LLM: %s", module.id, e)
        return None


def fallback_quiz(module_id: str) -> GeneratedQuiz | None:
    path = get_settings().data_dir / "training" / f"{module_id}.quiz.json"
    if not path.exists():
        return None
    try:
        return GeneratedQuiz.model_validate_json(path.read_text(encoding="utf-8"))
    except ValidationError as e:
        log.error("Файл %s с ошибкой: %s", path.name, e)
        return None


def for_client(module_id: str, questions: list[QuizItem]) -> Quiz:
    """Тот же тест, но без правильных ответов."""
    return Quiz(
        module_id=module_id,
        questions=[QuizQuestion(question=q.question, options=q.options) for q in questions],
    )


def submit(
    session: Session, volunteer: Volunteer, module: TrainingModule, answers: list[int]
) -> QuizResult:
    """Проверяет ответы, сохраняет попытку и двигает статус волонтёра. Без ответа — неверно."""
    questions = get_quiz(session, module)
    correct = [i < len(answers) and answers[i] == q.correct for i, q in enumerate(questions)]
    score = round(100 * sum(correct) / len(questions))
    session.add(QuizAttempt(volunteer_id=volunteer.id, module_id=module.id, score=score))
    session.commit()

    update_status(session, volunteer)
    return QuizResult(
        score=score,
        passed=score >= PASS_SCORE,
        correct=correct,
        correct_answers=[q.correct for q in questions],
        status=volunteer.status,
    )


def update_status(session: Session, volunteer: Volunteer) -> None:
    """new → training при первой попытке, training → trained, когда сданы все обязательные.

    Статусы, которые ставит координатор (approved, active, paused), не трогаем.
    """
    old = volunteer.status
    if volunteer.status == "new":
        volunteer.status = "training"
    if volunteer.status == "training":
        required = {m.id for m in load_modules() if m.required}
        if required <= passed_modules(session, volunteer.id):
            volunteer.status = "trained"
    if volunteer.status == old:
        return
    session.add(volunteer)
    session.commit()
    session.refresh(volunteer)
    volunteer_index.update_metadata(volunteer.id, volunteers.index_metadata(volunteer))
    notify.status_changed(volunteer, old)


def passed_modules(session: Session, volunteer_id: int) -> set[str]:
    best = (
        select(QuizAttempt.module_id)
        .where(QuizAttempt.volunteer_id == volunteer_id)
        .group_by(QuizAttempt.module_id)
        .having(func.max(QuizAttempt.score) >= PASS_SCORE)
    )
    return set(session.exec(best).all())
