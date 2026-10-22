"""Умный поиск: жёсткий фильтр, переранжирование LLM, фолбэк без LLM, отсутствие ПД в промпте."""

import json
import re
from pathlib import Path

import pytest
from sqlmodel import Session, select

from app.db import get_engine
from app.llm.client import get_llm
from app.llm.providers import FakeEmbedder, FakeProvider, LLMError
from app.models import Interaction

DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def form(name, about, skills, availability, region="moscow", formats=("offline",)):
    return {
        "name": name,
        "contact": f"@demo_{len(name)}_{region}",
        "answers": {
            "about": about,
            "skills": skills,
            "availability": list(availability),
            "region": region,
            "formats": list(formats),
        },
    }


PEOPLE = {
    "photo_morning": form("Фото Утренний", "Фотограф", "фото, своя камера", ["weekday_morning"]),
    "photo_weekend": form("Фото Субботний", "Фотограф", "фото, своя камера", ["weekend"]),
    "ceramics": form("Глина Субботняя", "Керамист", "керамика, лепка", ["weekend"]),
    "photo_yaroslavl": form(
        "Фото Ярославский", "Фотограф", "фото", ["weekday_morning"], region="yaroslavl"
    ),
    "smm_online": form(
        "Смм Онлайнова",
        "SMM-менеджер",
        "соцсети, тексты",
        ["weekday_evening"],
        region="moscow_region",
        formats=["online"],
    ),
    "photo_paused": form("Фото Паузный", "Фотограф", "фото", ["weekday_morning"]),
}


class SearchProvider(FakeProvider):
    """Отвечает на разбор запроса заданным ParsedQuery, на переранжирование — по id из промпта."""

    name = "test"  # не fake: с заглушкой fake поиск в LLM не ходит

    def __init__(self):
        self.parsed: dict | None = None
        self.rerank_ids: list[int] | None = None  # None — оценить всех из промпта
        self.seen: list[str] = []

    def complete(self, messages):
        text = "\n".join(m["content"] for m in messages)
        self.seen.append(text)
        if '"title": "ParsedQuery"' in text:
            return json.dumps(self.parsed, ensure_ascii=False)
        if '"title": "RerankResult"' in text:
            candidates = messages[-1]["content"].rsplit("Кандидаты:", 1)[1]  # после примера
            ids = self.rerank_ids or [int(i) for i in re.findall(r"^id: (\d+)", candidates, re.M)]
            items = [{"id": i, "score": 90 - n, "reason": "подходит"} for n, i in enumerate(ids)]
            return json.dumps({"items": items})
        return super().complete(messages)


class BrokenProvider(FakeProvider):
    def complete(self, messages):
        raise LLMError("модель недоступна")


@pytest.fixture
def llm(monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(DATA_DIR))
    from app.config import get_settings

    get_settings.cache_clear()
    client = get_llm()
    client.provider = SearchProvider()
    client._embedder = FakeEmbedder()
    return client


@pytest.fixture
def ids(client, llm):
    created = {key: client.post("/volunteers", json=f).json()["id"] for key, f in PEOPLE.items()}
    client.patch(f"/volunteers/{created['photo_paused']}", json={"status": "paused"})
    return created


def parsed(**changes):
    base = {
        "skills": ["фото"],
        "availability": [],
        "kind": "episodic",
        "region": None,
        "format": None,
        "notes": "",
    }
    return {**base, **changes}


def found(response) -> list[int]:
    assert response.status_code == 200, response.text
    return [c["volunteer"]["id"] for c in response.json()["candidates"]]


def test_hard_filter_by_time_region_format_and_status(client, llm, ids):
    llm.provider.parsed = parsed(
        availability=["weekday_morning"], region="moscow", format="offline"
    )
    r = client.post("/search", json={"query": "фотограф на четверг утром в Москве"})
    assert found(r) == [ids["photo_morning"]]
    body = r.json()
    assert body["total_checked"] == 1
    assert body["parsed"]["availability"] == ["weekday_morning"]
    top = body["candidates"][0]
    assert (top["ai"], top["reason"], top["score"]) == (True, "подходит", 90)
    assert top["volunteer"]["name"] == "Фото Утренний"  # имя — из БД, после LLM
    assert top["matched_skills"] == ["фото"]


def test_no_one_at_that_time_relaxes_time_but_keeps_region(client, llm, ids):
    # будни днём в анкетах нет ни у кого — показываем москвичей, свободных в другое время
    llm.provider.parsed = parsed(availability=["weekday_day"], region="moscow", format="offline")
    r = client.post("/search", json={"query": "фотограф в будни днём в Москве"})
    assert set(found(r)) == {ids["photo_morning"], ids["photo_weekend"], ids["ceramics"]}
    body = r.json()
    assert body["parsed"]["availability"] == ["weekday_day"]  # чипсы — как поняли запрос
    assert body["parsed"]["notes"] == "Никого не нашлось в это время — показываю без этого условия"
    rerank_prompt = next(t for t in llm.provider.seen if '"title": "RerankResult"' in t)
    assert "Когда: будни днём" in rerank_prompt  # LLM оценивает по исходному запросу
    assert "Никого не нашлось" not in rerank_prompt


def test_no_one_in_region_relaxes_time_then_region(client, llm, ids):
    llm.provider.parsed = parsed(
        availability=["weekday_day"], region="north_ossetia", format="offline", notes="с опытом"
    )
    r = client.post("/search", json={"query": "фотограф во Владикавказе в будни днём"})
    assert ids["photo_yaroslavl"] in found(r)
    assert ids["photo_paused"] not in found(r)  # статус не ослабляем
    assert r.json()["parsed"]["notes"] == (
        "Никого не нашлось в это время и в этом регионе — показываю без этих условий. с опытом"
    )


def test_no_relaxing_when_someone_fits(client, llm, ids):
    llm.provider.parsed = parsed(availability=["weekend"], region="moscow", format="offline")
    body = client.post("/search", json={"query": "фото в субботу"}).json()
    assert body["total_checked"] == 2
    assert body["parsed"]["notes"] == ""


def test_online_request_ignores_region(client, llm, ids):
    llm.provider.parsed = parsed(skills=["соцсети"], region="moscow", format="online")
    assert found(client.post("/search", json={"query": "вести соцсети онлайн"})) == [
        ids["smm_online"]
    ]


def test_paused_only_when_asked(client, llm, ids):
    llm.provider.parsed = parsed()
    assert ids["photo_paused"] not in found(client.post("/search", json={"query": "фото"}))
    r = client.post("/search", json={"query": "фото", "statuses": ["paused"]})
    assert found(r) == [ids["photo_paused"]]


def test_limit(client, llm, ids):
    llm.provider.parsed = parsed()
    assert len(found(client.post("/search", json={"query": "фото", "limit": 2}))) == 2


def test_rerank_order_wins(client, llm, ids):
    llm.provider.parsed = parsed(availability=["weekday_morning"])
    llm.provider.rerank_ids = [ids["photo_yaroslavl"], ids["photo_morning"]]
    r = client.post("/search", json={"query": "фото"})
    assert found(r) == [ids["photo_yaroslavl"], ids["photo_morning"]]


def test_fallback_when_llm_down(client, llm, ids):
    llm.provider = BrokenProvider()
    r = client.post("/search", json={"query": "нужно фото"})
    candidates = r.json()["candidates"]
    assert candidates and all(not c["ai"] for c in candidates)
    assert "фото" in candidates[0]["volunteer"]["answers"]["skills"]
    assert r.json()["parsed"]["skills"] == []  # запрос не разобран — без фильтров


class BrokenEmbedder(FakeEmbedder):
    def embed(self, texts, kind="doc"):
        raise LLMError("эмбеддинги недоступны")


def test_fallback_without_llm_and_embeddings_uses_query_words(client, llm, ids):
    llm.provider = BrokenProvider()
    llm._embedder = BrokenEmbedder()
    candidates = client.post("/search", json={"query": "нужен фотограф"}).json()["candidates"]
    assert candidates and all(not c["ai"] for c in candidates)
    assert candidates[0]["volunteer"]["answers"]["about"] == "Фотограф"
    assert candidates[0]["reason"] == "совпадение по словам запроса: фотограф"
    assert candidates[-1]["score"] == 0  # керамист и SMM ничем не совпали


def test_fallback_when_rerank_returns_foreign_ids(client, llm, ids):
    llm.provider.parsed = parsed(availability=["weekend"])
    llm.provider.rerank_ids = [999]
    candidates = client.post("/search", json={"query": "фото"}).json()["candidates"]
    assert {c["volunteer"]["id"] for c in candidates} == {ids["photo_weekend"], ids["ceramics"]}
    assert all(not c["ai"] for c in candidates)
    photo = next(c for c in candidates if c["volunteer"]["id"] == ids["photo_weekend"])
    assert photo["reason"] == "совпадение по навыкам: фото"
    assert photo == max(candidates, key=lambda c: c["score"])


def test_search_by_role_without_text(client, llm, ids):
    r = client.post("/search", json={"role_code": "art_saturdays_host"})
    body = r.json()
    assert body["parsed"]["availability"] == ["weekend"]
    assert "керамика" in body["parsed"]["skills"]
    assert found(r)[0] == ids["ceramics"]
    assert ids["photo_morning"] not in found(r)  # роль по субботам


def test_search_by_role_online_or_offline(client, llm, ids):
    body = client.post("/search", json={"role_code": "tutor"}).json()
    assert body["parsed"]["format"] is None  # репетитор — очно или онлайн, никого не отсекаем


def opportunity(client, **changes) -> int:
    data = {
        "title": "Мастер-класс по керамике",
        "description": "Помочь мастеру с глиной и гостями",
        "role_code": "art_saturdays_host",
        "starts_at": "2026-10-31T12:00:00",  # суббота
        "region": "moscow",
        "format": "offline",
        **changes,
    }
    r = client.post("/opportunities", json=data)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_search_by_opportunity_without_text(client, llm, ids):
    r = client.post("/search", json={"query": "", "opportunity_id": opportunity(client)})
    parsed_query = r.json()["parsed"]
    assert parsed_query["availability"] == ["weekend"]
    assert (parsed_query["region"], parsed_query["format"]) == ("moscow", "offline")
    assert "керамика" in parsed_query["skills"]
    assert found(r)[0] == ids["ceramics"]
    assert ids["photo_morning"] not in found(r)  # в субботу не может


def test_opportunity_time_and_place_beat_query_text(client, llm, ids):
    # координатор дописал «фотограф», а LLM поняла «будни утром» — но съёмка в субботу в Москве
    llm.provider.parsed = parsed(availability=["weekday_morning"], region="yaroslavl")
    oid = opportunity(client, role_code=None, title="Съёмка ярмарки", description="")
    r = client.post("/search", json={"query": "фотограф", "opportunity_id": oid})
    assert set(found(r)) == {ids["photo_weekend"], ids["ceramics"]}  # суббота, Москва, очно
    assert r.json()["parsed"]["region"] == "moscow"


def test_search_by_opportunity_without_role_and_llm(client, llm, ids):
    llm.provider = BrokenProvider()
    llm._embedder = BrokenEmbedder()
    oid = opportunity(client, role_code=None, title="Керамика для гостей", description="")
    r = client.post("/search", json={"opportunity_id": oid})
    assert found(r)[0] == ids["ceramics"]
    assert r.json()["candidates"][0]["reason"] == "совпадение по словам запроса: керамика"


def test_rerank_prompt_has_no_personal_data(client, llm, ids):
    llm.provider.parsed = parsed()
    client.post("/search", json={"query": "фото"})
    rerank_prompt = next(t for t in llm.provider.seen if '"title": "RerankResult"' in t)
    assert f"id: {ids['photo_morning']}" in rerank_prompt
    for f in PEOPLE.values():
        assert f["name"] not in rerank_prompt
        assert f["contact"] not in rerank_prompt


def test_search_is_logged(client, llm, ids):
    llm.provider.parsed = parsed()
    client.post("/search", json={"query": "фотограф на субботу"})
    with Session(get_engine()) as session:
        rows = session.exec(select(Interaction).where(Interaction.kind == "search")).all()
    assert [r.question for r in rows] == ["фотограф на субботу"]
    assert "мс" in rows[0].answer


def test_bad_requests(client, llm):
    assert client.post("/search", json={"query": "  "}).status_code == 400
    assert client.post("/search", json={"role_code": "astronaut"}).status_code == 404
    assert client.post("/search", json={"opportunity_id": 999}).status_code == 404


def test_empty_base(client, llm):
    llm.provider.parsed = parsed()
    body = client.post("/search", json={"query": "фото"}).json()
    assert (body["candidates"], body["total_checked"]) == ([], 0)
