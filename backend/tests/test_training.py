"""Обучение: модули → тест от LLM (кэш, фолбэк из файла) → проверка → статус и балл волонтёра."""

import json
from pathlib import Path

import pytest

from app.llm.client import get_llm
from app.llm.providers import FakeProvider, LLMError
from app.rag.store import get_collection
from app.services.training import GeneratedQuiz, load_modules

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

CORRECT = [1, 0, 2, 1, 0]
QUIZ = {
    "questions": [
        {"question": f"Вопрос {i + 1}?", "options": ["а", "б", "в"], "correct": c}
        for i, c in enumerate(CORRECT)
    ]
}
WRONG = [(c + 1) % 3 for c in CORRECT]

FORM = {
    "name": "Тест Тестович",
    "contact": "@test",
    "answers": {"about": "Студент, хочу помогать на мастерских", "availability": ["weekend"]},
}


class QuizProvider(FakeProvider):
    """Fake-модель: на просьбу составить тест отвечает QUIZ (или answer), остальное — как fake."""

    def __init__(self, answer: str | None = None):
        self.answer = answer if answer is not None else json.dumps(QUIZ, ensure_ascii=False)
        self.prompts: list[str] = []

    def complete(self, messages):
        text = "\n".join(m["content"] for m in messages)
        if "составляешь короткий тест" not in text:
            return super().complete(messages)
        self.prompts.append(text)
        return self.answer


class BrokenProvider(FakeProvider):
    def complete(self, messages):
        raise LLMError("модель недоступна")


def write_module(folder: Path, module_id: str, title: str, required: bool) -> None:
    text = f"---\ntitle: {title}\nrequired: {str(required).lower()}\n---\n\nТекст модуля {title}."
    (folder / f"{module_id}.md").write_text(text, encoding="utf-8")


@pytest.fixture
def training_dir(tmp_path, monkeypatch) -> Path:
    """Два обязательных модуля и один дополнительный во временной папке."""
    folder = tmp_path / "data" / "training"
    folder.mkdir(parents=True)
    write_module(folder, "01-about", "О фонде", True)
    write_module(folder, "02-safety", "Безопасность на кухне", True)
    write_module(folder, "03-extra", "Дополнительно", False)
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    from app.config import get_settings

    get_settings.cache_clear()
    return folder


@pytest.fixture
def llm(training_dir):
    client = get_llm()
    client.provider = QuizProvider()
    return client


@pytest.fixture
def volunteer_id(client, llm) -> int:
    return client.post("/volunteers", json=FORM).json()["id"]


def submit(client, volunteer_id: int, module_id: str, answers: list[int]) -> dict:
    client.get(f"/training/{module_id}/quiz")
    data = {"volunteer_id": volunteer_id, "module_id": module_id, "answers": answers}
    r = client.post("/training/submit", json=data)
    assert r.status_code == 200, r.text
    return r.json()


def test_modules_list(client, llm):
    modules = client.get("/training").json()
    assert [m["id"] for m in modules] == ["01-about", "02-safety", "03-extra"]
    assert modules[1]["title"] == "Безопасность на кухне"
    assert [m["required"] for m in modules] == [True, True, False]


def test_quiz_is_generated_once_and_hides_answers(client, llm):
    first = client.get("/training/01-about/quiz").json()
    second = client.get("/training/01-about/quiz").json()
    assert first == second
    assert len(llm.provider.prompts) == 1  # второй раз — из кэша
    assert first["module_id"] == "01-about"
    assert len(first["questions"]) == 5
    assert all(set(q) == {"question", "options"} for q in first["questions"])
    assert "Текст модуля О фонде" in llm.provider.prompts[0]


def test_unknown_module_and_volunteer(client, llm, volunteer_id):
    assert client.get("/training/nope/quiz").status_code == 404
    data = {"volunteer_id": volunteer_id, "module_id": "nope", "answers": []}
    assert client.post("/training/submit", json=data).status_code == 404
    data = {"volunteer_id": 999, "module_id": "01-about", "answers": CORRECT}
    assert client.post("/training/submit", json=data).status_code == 404


def test_statuses_and_score(client, llm, volunteer_id):
    r = submit(client, volunteer_id, "01-about", CORRECT)
    assert r == {
        "score": 100,
        "passed": True,
        "correct": [True] * 5,
        "correct_answers": CORRECT,
        "status": "training",
    }

    r = submit(client, volunteer_id, "02-safety", [*CORRECT[:3], *WRONG[3:]])
    assert (r["score"], r["passed"], r["status"]) == (60, False, "training")

    # дополнительный модуль даёт балл, но на статус не влияет
    r = submit(client, volunteer_id, "03-extra", CORRECT)
    assert r["status"] == "training"

    r = submit(client, volunteer_id, "02-safety", [*CORRECT[:4], WRONG[4]])
    assert (r["score"], r["passed"], r["status"]) == (80, True, "trained")

    v = client.get(f"/volunteers/{volunteer_id}").json()
    assert v["status"] == "trained"
    assert v["training_score"] == 93  # лучшие попытки: 100, 80, 100
    meta = get_collection("volunteers").get(ids=[str(volunteer_id)])["metadatas"][0]
    assert meta["status"] == "trained"  # поиск видит новый статус


def test_failed_first_attempt_starts_training(client, llm, volunteer_id):
    r = submit(client, volunteer_id, "01-about", WRONG)
    assert (r["score"], r["passed"], r["status"]) == (0, False, "training")


def test_missing_answers_are_wrong(client, llm, volunteer_id):
    r = submit(client, volunteer_id, "01-about", CORRECT[:2])
    assert r["score"] == 40
    assert r["correct"] == [True, True, False, False, False]


def test_coordinator_status_is_kept(client, llm, volunteer_id):
    client.patch(f"/volunteers/{volunteer_id}", json={"status": "paused"})
    assert submit(client, volunteer_id, "01-about", CORRECT)["status"] == "paused"


def test_fallback_file_when_llm_fails(client, llm, training_dir):
    llm.provider = BrokenProvider()
    (training_dir / "01-about.quiz.json").write_text(json.dumps(QUIZ), encoding="utf-8")
    quiz = client.get("/training/01-about/quiz").json()
    assert [q["question"] for q in quiz["questions"]] == [q["question"] for q in QUIZ["questions"]]


def test_no_llm_and_no_file(client, llm):
    llm.provider = BrokenProvider()
    r = client.get("/training/01-about/quiz")
    assert r.status_code == 502
    assert "тест" in r.json()["detail"]


@pytest.mark.parametrize(
    "answer",
    [
        json.dumps({"questions": QUIZ["questions"][:2]}),  # мало вопросов
        json.dumps({"questions": [{**q, "correct": 7} for q in QUIZ["questions"]]}),
        "не JSON",
    ],
)
def test_bad_llm_answer_uses_fallback(client, llm, training_dir, answer):
    llm.provider.answer = answer
    fallback = {"questions": [{**q, "question": "Из файла?"} for q in QUIZ["questions"]]}
    (training_dir / "01-about.quiz.json").write_text(json.dumps(fallback), encoding="utf-8")
    quiz = client.get("/training/01-about/quiz").json()
    assert quiz["questions"][0]["question"] == "Из файла?"


def test_repo_quiz_files_are_valid(monkeypatch):
    """Готовые тесты в data/training/ валидны и относятся к существующим модулям."""
    monkeypatch.setenv("DATA_DIR", str(DATA_DIR))
    from app.config import get_settings

    get_settings.cache_clear()
    module_ids = {m.id for m in load_modules()}
    files = sorted((DATA_DIR / "training").glob("*.quiz.json"))
    assert files
    for path in files:
        assert path.name.removesuffix(".quiz.json") in module_ids, path.name
        GeneratedQuiz.model_validate_json(path.read_text(encoding="utf-8"))


def test_trained_volunteer_gets_telegram_message(client, llm, telegram):
    volunteer_id = client.post("/volunteers", json={**FORM, "telegram_id": 800800}).json()["id"]
    submit(client, volunteer_id, "01-about", CORRECT)
    assert telegram == []  # new → training — не пишем
    assert submit(client, volunteer_id, "02-safety", CORRECT)["status"] == "trained"
    assert [(m["chat_id"], "обучение" in m["text"]) for m in telegram] == [(800800, True)]
