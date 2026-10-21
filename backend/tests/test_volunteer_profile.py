"""Анкета → профиль (LLM) → векторный индекс. Персональные данные не уходят ни в LLM, ни в индекс."""

import json
from pathlib import Path

import pytest

from app.llm.client import get_llm
from app.llm.providers import FakeEmbedder, FakeProvider, LLMError
from app.rag.store import get_collection

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

FORM = {
    "name": "Зинаида Уникальнова",
    "contact": "@demo_secret_contact",
    "telegram_id": 987654321,
    "answers": {
        "about": "Пенсионерка, всю жизнь фотографировала",
        "skills": "фото, своя камера",
        "wishes": "снимать мастерские",
        "availability": ["weekday_morning", "weekend"],
        "occupation": "pensioner",
        "region": "yaroslavl",
        "formats": ["offline", "online"],
        "regularity": "episodic",
    },
}
PERSONAL = ["Зинаида", "Уникальнова", "demo_secret_contact", "987654321"]


class RecordingProvider(FakeProvider):
    """Fake-модель, которая запоминает всё, что ей отправили."""

    def __init__(self, answer: str | None = None):
        self.seen: list[str] = []
        self.answer = answer

    def complete(self, messages):
        self.seen += [m["content"] for m in messages]
        return self.answer if self.answer is not None else super().complete(messages)


class RecordingEmbedder(FakeEmbedder):
    def __init__(self):
        self.seen: list[str] = []

    def embed(self, texts, kind="doc"):
        self.seen += texts
        return super().embed(texts, kind)


class BrokenProvider(FakeProvider):
    def complete(self, messages):
        raise LLMError("модель недоступна")


@pytest.fixture
def llm(monkeypatch):
    """Подменяет модель и эмбеддинги в общем get_llm(); роли — из data/roles.json репозитория."""
    monkeypatch.setenv("DATA_DIR", str(DATA_DIR))
    from app.config import get_settings

    get_settings.cache_clear()
    client = get_llm()
    client.provider = RecordingProvider()
    client._embedder = RecordingEmbedder()
    return client


def indexed(volunteer_id: int) -> dict:
    got = get_collection("volunteers").get(ids=[str(volunteer_id)])
    assert got["ids"], "волонтёр не попал в индекс"
    return {"document": got["documents"][0], "metadata": got["metadatas"][0]}


def test_create_fills_profile(client, llm):
    v = client.post("/volunteers", json=FORM).json()
    assert v["profile"] is not None
    assert set(v["profile"]) == {"skills", "interests", "suitable_roles", "summary"}
    assert client.get(f"/volunteers/{v['id']}").json()["profile"] == v["profile"]


def test_profile_prompt_has_answers_and_roles(client, llm):
    client.post("/volunteers", json=FORM)
    prompt = "\n".join(llm.provider.seen)
    assert "всю жизнь фотографировала" in prompt
    assert "Ярославская область" in prompt  # коды переведены в понятные слова
    assert "photographer: Фотограф" in prompt


def test_unknown_roles_are_dropped(client, llm):
    profile = {
        "skills": ["фото"],
        "interests": ["мастерские"],
        "suitable_roles": ["photographer", "astronaut"],
        "summary": "Фотограф с опытом, свободна утром в будни и в выходные",
    }
    llm.provider.answer = json.dumps(profile, ensure_ascii=False)
    v = client.post("/volunteers", json=FORM).json()
    assert v["profile"]["suitable_roles"] == ["photographer"]


def test_form_is_saved_when_llm_fails(client, llm):
    llm.provider = BrokenProvider()
    r = client.post("/volunteers", json=FORM)
    assert r.status_code == 200
    v = r.json()
    assert v["profile"] is None
    assert "фотографировала" in indexed(v["id"])["document"]  # в поиск попадает и без профиля


def test_index_document_and_metadata(client, llm):
    profile = {
        "skills": ["фото", "предметная съёмка"],
        "interests": ["мастерские"],
        "suitable_roles": ["photographer"],
        "summary": "Фотограф с опытом",
    }
    llm.provider.answer = json.dumps(profile, ensure_ascii=False)
    v = client.post("/volunteers", json=FORM).json()
    item = indexed(v["id"])
    assert "предметная съёмка" in item["document"]
    assert "фотографировала" in item["document"]
    assert item["metadata"] == {
        "status": "new",
        "occupation": "pensioner",
        "region": "yaroslavl",
        "regularity": "episodic",
        "availability": ["weekday_morning", "weekend"],
        "formats": ["offline", "online"],
    }


def test_empty_availability_is_indexed(client, llm):
    form = {**FORM, "answers": {**FORM["answers"], "availability": []}}
    v = client.post("/volunteers", json=form).json()
    assert "availability" not in indexed(v["id"])["metadata"]


def test_patch_updates_index_metadata(client, llm):
    v = client.post("/volunteers", json=FORM).json()
    client.patch(f"/volunteers/{v['id']}", json={"status": "approved"})
    assert indexed(v["id"])["metadata"]["status"] == "approved"


def test_personal_data_never_leaves(client, llm):
    v = client.post("/volunteers", json=FORM).json()
    client.post(f"/volunteers/{v['id']}/notes", json={"text": "Секретная заметка координатора"})
    client.patch(f"/volunteers/{v['id']}", json={"status": "approved", "hours": 2})

    item = indexed(v["id"])
    sent = [*llm.provider.seen, *llm.embedder.seen, item["document"], str(item["metadata"])]
    assert llm.provider.seen and llm.embedder.seen
    for text in sent:
        for secret in [*PERSONAL, "Секретная заметка"]:
            assert secret not in text
