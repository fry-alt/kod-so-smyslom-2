"""Демо-данные для жюри и для метрики hit@3: анкеты валидны, бенчмарк ссылается на существующие анкеты."""

import json
import re
from collections import Counter
from pathlib import Path
from typing import get_args

from app.schemas import InterviewResultIn, OpportunityIn, VolunteerIn, VolunteerStatus

DEMO_DIR = Path(__file__).resolve().parents[2] / "data" / "demo"

FICTIONAL_CONTACT = re.compile(r"^(\+7 900 000-00-\d\d|@demo_\w+|[\w.]+@example\.com)$")


def load(name: str):
    return json.loads((DEMO_DIR / name).read_text(encoding="utf-8"))


def volunteers() -> list[VolunteerIn]:
    return [VolunteerIn.model_validate(v) for v in load("volunteers.json")]


def test_forty_valid_forms_with_fictional_contacts():
    forms = volunteers()
    assert len(forms) == 40
    for v in forms:
        assert FICTIONAL_CONTACT.match(v.contact), v.contact
        assert v.telegram_id is None


def test_demo_mix_looks_like_real_life():
    forms = volunteers()
    occupations = Counter(v.answers.occupation for v in forms)
    assert occupations["student"] >= 12 and occupations["pensioner"] >= 8
    regions = Counter(v.answers.region for v in forms)
    assert regions["moscow"] + regions["moscow_region"] > len(forms) / 2
    assert 3 <= regions["yaroslavl"] <= 4 and 3 <= regions["north_ossetia"] <= 4
    assert sum(v.answers.formats == ["online"] for v in forms) >= 3
    weekday_daytime = {"weekday_morning", "weekday_day"}
    free_on_weekdays = sum(bool(weekday_daytime & set(v.answers.availability)) for v in forms)
    assert free_on_weekdays < len(forms) / 2  # как в жизни: большинство в будни днём заняты


def test_benchmark_points_to_existing_forms():
    queries = load("search_benchmark.json")["queries"]
    assert len(queries) == 10
    for q in queries:
        assert q["query"].strip()
        assert 1 <= len(q["expected"]) <= 3
        assert all(1 <= n <= 40 for n in q["expected"])


def test_seed_through_api(client):
    for v in load("volunteers.json"):
        assert client.post("/volunteers", json=v).status_code == 200
    ids = sorted(v["id"] for v in client.get("/volunteers").json())
    assert ids == list(range(1, 41))  # номер анкеты в файле = id на пустой базе


def test_benchmark_hit_at_3_without_llm(client):
    """Поиск на fake (тот же, что при недоступной LLM) находит эталонных людей. Цифры — docs/METRICS.md."""
    for v in load("volunteers.json"):
        client.post("/volunteers", json=v)
    hits = 0
    for q in load("search_benchmark.json")["queries"]:
        candidates = client.post("/search", json={"query": q["query"]}).json()["candidates"]
        top = {c["volunteer"]["id"] for c in candidates[:3]}
        hits += bool(top & set(q["expected"]))
        assert not any(c["ai"] for c in candidates)
    assert hits >= 9


def test_demo_opportunities_valid_and_seed_through_api(client):
    items = [OpportunityIn.model_validate(o) for o in load("opportunities.json")]
    assert 6 <= len(items) <= 8
    roles = {r["code"] for r in load_roles_file()}
    assert all(o.role_code in roles for o in items)
    assert {o.region for o in items} >= {"moscow", "yaroslavl", "north_ossetia"}
    assert any(o.format == "online" for o in items)
    for o in load("opportunities.json"):
        assert client.post("/opportunities", json=o).status_code == 200
    assert len(client.get("/opportunities").json()) == len(items)


def load_roles_file():
    return json.loads((DEMO_DIR.parent / "roles.json").read_text(encoding="utf-8"))


def test_history_is_consistent():
    """history.json: статусы, прошлые занятия, отклики и собеседования для дашбордов (T-66)."""
    history = load("history.json")
    forms = volunteers()
    roles_file = DEMO_DIR.parent / "roles.json"
    roles = {r["code"] for r in json.loads(roles_file.read_text(encoding="utf-8"))}

    def in_range(number: int) -> bool:
        return 1 <= number <= len(forms)

    for number, status in history["statuses"].items():
        assert in_range(int(number)) and status in get_args(VolunteerStatus)

    for past in history["past_opportunities"]:
        assert past["days_ago"] > 0
        OpportunityIn.model_validate(
            {**past["opportunity"], "starts_at": f"2026-01-01T{past['time']}:00"}
        )
        assert past["opportunity"]["role_code"] in roles
        assert len(past["attended"]) <= past["opportunity"]["slots"]
        assert all(in_range(n) for n in past["attended"])

    titles = {o["title"] for o in load("opportunities.json")}
    for response in history["responses"]:
        assert response["opportunity"] in titles and in_range(response["volunteer"])

    for interview in history["interviews"]:
        assert in_range(interview["volunteer"])
        if interview.get("result"):
            result = InterviewResultIn.model_validate(interview["result"])
            assert set(result.roles) <= roles
            assert interview["days"] < 0  # итог бывает только у прошедших

    # школьники отваливаются: никто из них не дошёл до допуска — это видно на воронке
    schoolkids = {str(i) for i, f in enumerate(forms, 1) if f.answers.occupation == "schoolkid"}
    assert (
        not {n for n, s in history["statuses"].items() if s in ("approved", "active")} & schoolkids
    )
