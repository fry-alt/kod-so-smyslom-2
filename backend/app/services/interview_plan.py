"""AI-план собеседования (T-66): вопросы под конкретную анкету.

В LLM уходят только ответы анкеты и профиль — без имени, контакта и заметок (152-ФЗ).
Готовый план хранится в таблице InterviewPlan, чтобы вопросы не менялись во время звонка.
LLM недоступен — базовые вопросы и правила по анкете; такой план не сохраняем, в следующий раз пробуем LLM.
"""

import logging
from datetime import UTC, datetime

from pydantic import BaseModel, Field
from sqlmodel import Session

from app.llm.client import get_llm
from app.llm.prompts import load_prompt
from app.llm.providers import LLMError
from app.models import InterviewPlan as PlanRow
from app.models import Volunteer
from app.schemas import Answers, InterviewPlan, PlanQuestion, Profile
from app.services.volunteers import answers_text

log = logging.getLogger(__name__)


class GeneratedPlan(BaseModel):
    """Ответ LLM: вопросы и на что обратить внимание."""

    questions: list[PlanQuestion] = Field(min_length=1, max_length=8)
    focus: list[str] = Field(default_factory=list, max_length=3)


BASE_QUESTIONS = [
    PlanQuestion(question="Почему вы хотите помогать именно нашему фонду?", why="Понять мотивацию"),
    PlanQuestion(
        question="Был ли у вас опыт общения с детьми или взрослыми с особенностями развития?",
        why="Готовность к работе с подопечными",
    ),
    PlanQuestion(
        question="Что вы сделаете, если на занятии станет тяжело или непонятно, как себя вести?",
        why="Как человек справляется с трудными ситуациями",
    ),
    PlanQuestion(
        question="Как часто у вас реально получится приходить?",
        why="Сверить ожидания по регулярности",
    ),
]


def get_or_build(session: Session, volunteer: Volunteer, refresh: bool = False) -> InterviewPlan:
    """Сохранённый план или новый. refresh — составить заново (старый остаётся, если LLM не ответил)."""
    row = session.get(PlanRow, volunteer.id)
    if row is not None and not refresh:
        return _out(row)
    generated = generate(volunteer)
    if generated is None:
        if row is not None:
            return _out(row)
        plan = fallback(Answers.model_validate(volunteer.answers))
        return InterviewPlan(
            volunteer_id=volunteer.id, **plan.model_dump(), ai=False, created_at=datetime.now(UTC)
        )
    if row is None:
        row = PlanRow(volunteer_id=volunteer.id, questions=[], focus=[])
    row.questions = [q.model_dump() for q in generated.questions]
    row.focus = list(generated.focus)
    row.created_at = datetime.now(UTC)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _out(row)


def generate(volunteer: Volunteer) -> GeneratedPlan | None:
    """LLM составляет план по анкете. None — модель недоступна или дважды ответила мусором."""
    prompt = load_prompt(
        "interview_plan",
        answers=answers_text(Answers.model_validate(volunteer.answers)),
        profile=profile_text(volunteer.profile),
    )
    try:
        return get_llm().chat_json(prompt, GeneratedPlan, system=load_prompt("system"))
    except LLMError as e:
        log.warning("План собеседования без LLM: %s", e)
        return None


def profile_text(profile: dict | None) -> str:
    if not profile:
        return "ещё не построен"
    p = Profile.model_validate(profile)
    return (
        f"навыки — {', '.join(p.skills) or 'нет'}; интересы — {', '.join(p.interests) or 'нет'}; "
        f"подходящие роли — {', '.join(p.suitable_roles) or 'нет'}"
    )


def fallback(answers: Answers) -> GeneratedPlan:
    """Базовые вопросы + правила по анкете — если LLM недоступен."""
    questions = list(BASE_QUESTIONS)
    focus = []
    if answers.occupation == "schoolkid":
        questions.append(
            PlanQuestion(
                question="Нужны ли вам часы или баллы для школы? Сколько занятий планируете?",
                why="Школьники часто приходят ради баллов и пропадают",
            )
        )
        focus.append("Школьник — проверить, готов ли прийти больше одного раза")
    if not answers.experience.strip():
        questions.append(
            PlanQuestion(
                question="Как вы представляете занятие с особыми ребятами?",
                why="Опыта в анкете нет",
            )
        )
        focus.append("Нет опыта — рассказать, как проходят занятия")
    if answers.occupation == "pensioner":
        questions.append(
            PlanQuestion(
                question="Удобно ли вам добираться? Сколько времени комфортно провести на занятии?",
                why="Силы и дорога — частые причины пропусков",
            )
        )
    if answers.regularity == "regular":
        questions.append(
            PlanQuestion(
                question="Готовы ли вы ходить к одной группе несколько месяцев?",
                why="Постоянным группам важны одни и те же взрослые",
            )
        )
    return GeneratedPlan(questions=questions, focus=focus)


def _out(row: PlanRow) -> InterviewPlan:
    return InterviewPlan(
        volunteer_id=row.volunteer_id,
        questions=row.questions,
        focus=row.focus,
        ai=True,
        created_at=row.created_at,
    )
