from sqlmodel import Session, select

from app.db import get_engine
from app.models import Interaction


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["llm_provider"] == "fake"
    assert body["documents"] == 0


def test_chat_answers_and_logs_interaction(client):
    r = client.post("/chat", json={"message": "Привет!", "channel": "web", "user_id": "u1"})
    assert r.status_code == 200
    assert "[fake]" in r.json()["answer"]

    with Session(get_engine()) as session:
        rows = session.exec(select(Interaction)).all()
    assert len(rows) == 1
    assert rows[0].channel == "web"
    assert rows[0].question == "Привет!"


def test_chat_validates_input(client):
    assert client.post("/chat", json={"message": ""}).status_code == 422


def test_chat_stream_sends_sse(client):
    with client.stream("POST", "/chat/stream", json={"message": "Расскажи о фонде"}) as r:
        assert r.status_code == 200
        lines = [line for line in r.iter_lines() if line.startswith("data: ")]
    assert lines[-1] == "data: [DONE]"
    assert any('"delta"' in line for line in lines)


def test_case_stub_returns_schema(client):
    r = client.post("/case/run", json={"text": "Хочу помогать по вечерам"})
    assert r.status_code == 200
    assert set(r.json()) == {"summary", "category", "next_steps"}


def test_llm_error_is_502(client, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "yandex")
    monkeypatch.setenv("YANDEX_API_KEY", "")
    from app.config import get_settings
    from app.llm.client import get_llm

    get_settings.cache_clear()
    get_llm.cache_clear()
    r = client.post("/chat", json={"message": "Привет"})
    assert r.status_code == 502
    assert "YANDEX_API_KEY" in r.json()["detail"]
