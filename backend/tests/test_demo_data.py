"""Демо-данные для жюри и для метрики hit@3: анкеты валидны, бенчмарк ссылается на существующие анкеты."""

import json
import re
from collections import Counter
from pathlib import Path

from app.schemas import VolunteerIn

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
