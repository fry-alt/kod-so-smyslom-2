import json

from app.llm.client import get_llm
from app.llm.providers import FakeProvider, LLMError
from app.rag.answer import LLM_FAILED, NOT_FOUND, answer_question
from app.rag.ingest import ingest_path, read_text, split_text
from app.rag.retrieve import retrieve
from conftest import DEMO_DIR

TRAINING_DIR = DEMO_DIR.parent / "training"


class AnswerProvider(FakeProvider):
    """Fake-модель с заданным ответом; запоминает промпт."""

    def __init__(self, answer: str):
        self.answer = answer
        self.prompt = ""

    def complete(self, messages):
        self.prompt = messages[-1]["content"]
        return self.answer


class BrokenProvider(FakeProvider):
    def complete(self, messages):
        raise LLMError("модель недоступна")


def test_split_text_respects_size():
    text = "\n\n".join(f"Абзац номер {i}. " * 5 for i in range(30))
    chunks = split_text(text, size=300, overlap=50)
    assert len(chunks) > 1
    assert all(len(c) <= 300 for c in chunks)


def test_readers_extract_text_from_all_demo_formats():
    for name in (
        "workshop_guide.docx",
        "volunteer_shifts.xlsx",
        "events.csv",
        "faq.md",
        "donations.txt",
    ):
        assert len(read_text(DEMO_DIR / name)) > 100, name
    assert "координатор: Анна" in read_text(DEMO_DIR / "volunteer_shifts.xlsx")


def test_ask_finds_answer_with_source(client):
    counts = ingest_path(DEMO_DIR)
    assert len(counts) >= 5 and all(counts.values())

    r = client.post("/documents/ask", json={"question": "Нужна ли справка о несудимости?"})
    assert r.status_code == 200
    body = r.json()
    assert body["found"] is True
    assert body["sources"][0]["source"] == "volunteer_rules.md"


def test_ask_says_dont_know_when_no_data(client):
    ingest_path(DEMO_DIR)
    r = client.post("/documents/ask", json={"question": "Квантовая хромодинамика глюонов"})
    assert r.json()["found"] is False
    assert r.json()["sources"] == []


def test_ask_on_empty_index(client):
    r = client.post("/documents/ask", json={"question": "Что угодно"})
    assert r.json()["found"] is False
    assert r.json()["answer"] == NOT_FOUND
    assert "координатор" in NOT_FOUND


def test_training_texts_are_ingested_without_front_matter():
    counts = ingest_path(TRAINING_DIR)
    assert len(counts) >= 3 and all(counts.values())
    text = read_text(TRAINING_DIR / "01-about.md")
    assert not text.startswith("---") and "required:" not in text


def test_typical_questions_find_expected_sources():
    """10 вопросов новичка (data/demo/rag_questions.json): в контекст для LLM попадает файл,
    где есть ответ. На fake-эмбеддингах («мешок слов») — хотя бы 7 из 8, на реальных лучше."""
    ingest_path(DEMO_DIR)
    ingest_path(TRAINING_DIR)
    questions = json.loads((DEMO_DIR / "rag_questions.json").read_text(encoding="utf-8"))
    answerable = [q for q in questions["questions"] if q["expected"]]
    assert len(questions["questions"]) == 10 and len(answerable) == 8
    hits = [
        q["question"]
        for q in answerable
        if any(s.source in q["expected"] for s in retrieve(q["question"]))
    ]
    assert len(hits) >= 7, set(q["question"] for q in answerable) - set(hits)


def test_answer_cites_sources_from_context():
    ingest_path(DEMO_DIR)
    provider = AnswerProvider('{"found": true, "answer": "Да, нужна.", "sources": [1]}')
    get_llm().provider = provider
    result = answer_question("Нужна ли справка о несудимости?")
    assert result.found and result.answer == "Да, нужна."
    assert result.sources[0].source == "volunteer_rules.md"
    # в промпте — пример «не знаю», найденный фрагмент с именем файла и сам вопрос
    assert "Спросите координатора" in provider.prompt
    assert "источник: volunteer_rules.md" in provider.prompt
    assert provider.prompt.endswith("Нужна ли справка о несудимости?")


def test_model_says_not_found(client):
    ingest_path(DEMO_DIR)
    get_llm().provider = AnswerProvider('{"found": false, "answer": "нет данных", "sources": []}')
    r = client.post("/documents/ask", json={"question": "Можно ли прийти со своей собакой?"})
    assert r.json() == {"answer": NOT_FOUND, "found": False, "sources": []}


def test_model_failure_shows_fragments(client):
    ingest_path(DEMO_DIR)
    get_llm().provider = BrokenProvider()
    r = client.post("/documents/ask", json={"question": "Нужна ли справка о несудимости?"})
    assert r.status_code == 200
    body = r.json()
    assert body["found"] is False and body["answer"] == LLM_FAILED
    assert body["sources"][0]["source"] == "volunteer_rules.md"


def test_upload_and_list(client):
    files = {"file": ("rules.txt", "Смена волонтёра длится два часа.".encode(), "text/plain")}
    r = client.post("/documents/upload", files=files)
    assert r.status_code == 200
    assert r.json() == {"filename": "rules.txt", "chunks": 1}
    assert client.get("/documents").json()["files"] == ["rules.txt"]

    # повторная загрузка того же файла не дублирует чанки
    client.post("/documents/upload", files=files)
    assert client.get("/documents").json()["chunks"] == 1

    assert client.delete("/documents/rules.txt").json() == {"deleted": 1}
    assert client.get("/documents").json()["files"] == []
    assert client.delete("/documents/rules.txt").status_code == 404


def test_upload_rejects_unknown_format(client):
    r = client.post(
        "/documents/upload", files={"file": ("x.exe", b"MZ", "application/octet-stream")}
    )
    assert r.status_code == 400
