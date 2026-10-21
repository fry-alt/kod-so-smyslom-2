"""Часы волонтёров: CSV для «Добро.рф» (Excel, кириллица) и благодарность от фонда (LLM и шаблон)."""

import csv
import io
from pathlib import Path

import pytest

from app.llm.client import get_llm
from app.llm.providers import FakeProvider, LLMError

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

FORM = {
    "name": "Олег Часовой",
    "contact": "+7 900 000-00-03",
    "answers": {"about": "Фотограф, снимаю в выходные", "availability": ["weekend"]},
}
PHOTO = {
    "title": "Фотосъёмка изделий для каталога",
    "role_code": "photographer",
    "starts_at": "2026-10-31T12:00:00",
    "hours": 4.5,
}


class ThanksProvider(FakeProvider):
    name = "test"  # не fake: с заглушкой fake благодарность пишется по шаблону

    def __init__(self):
        self.prompts: list[str] = []

    def complete(self, messages):
        self.prompts.append("\n".join(m["content"] for m in messages))
        return "Спасибо за помощь на съёмке — ребята увидели свои работы в каталоге."


class BrokenProvider(FakeProvider):
    name = "test"

    def complete(self, messages):
        raise LLMError("модель недоступна")


@pytest.fixture(autouse=True)
def data_dir(monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(DATA_DIR))
    from app.config import get_settings

    get_settings.cache_clear()


@pytest.fixture
def volunteer_id(client) -> int:
    """Волонтёр, который отработал съёмку: 4,5 часа, роль «Фотограф»."""
    vid = client.post("/volunteers", json=FORM).json()["id"]
    opportunity = client.post("/opportunities", json=PHOTO).json()
    participation = client.post(
        f"/opportunities/{opportunity['id']}/respond", json={"volunteer_id": vid}
    ).json()
    r = client.patch(f"/participations/{participation['id']}", json={"status": "attended"})
    assert r.status_code == 200, r.text
    return vid


def test_export_csv_opens_in_excel(client, volunteer_id):
    client.post("/volunteers", json={**FORM, "name": "=Ноль Часов", "contact": "@demo_zero"})
    r = client.get("/volunteers/export.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    assert r.content.startswith("﻿".encode())  # BOM — Excel узнаёт UTF-8 и кириллицу
    rows = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig")), delimiter=";"))
    assert rows[0] == ["Имя", "Контакт", "Часы", "Роли", "Статус"]
    # больше часов — выше; телефон и «=…» — текстом, не формулой; дробная запятая
    assert rows[1] == ["Олег Часовой", "'+7 900 000-00-03", "4,5", "Фотограф", "Новая анкета"]
    assert rows[2] == ["'=Ноль Часов", "'@demo_zero", "0", "", "Новая анкета"]


def test_export_csv_route_is_not_a_volunteer_id(client):
    assert client.get("/volunteers/export.csv").status_code == 200  # не 422 от /{volunteer_id}


def test_thanks_from_llm_without_personal_data(client, volunteer_id):
    llm = get_llm()
    llm.provider = ThanksProvider()
    r = client.get(f"/volunteers/{volunteer_id}/thanks")
    assert r.status_code == 200
    body = r.json()
    assert body["ai"] is True
    assert body["text"].startswith("Олег Часовой, здравствуйте!")
    assert "ребята увидели свои работы" in body["text"]
    assert body["text"].endswith("Фонд «Дети Марии»")
    prompt = llm.provider.prompts[-1]
    assert "Часов: 4,5" in prompt and "Роли: Фотограф" in prompt
    assert "Мероприятия: Фотосъёмка изделий для каталога" in prompt
    assert FORM["name"] not in prompt and FORM["contact"] not in prompt


@pytest.mark.parametrize("provider", [None, BrokenProvider()], ids=["fake", "llm-down"])
def test_thanks_template_without_llm(client, volunteer_id, provider):
    if provider:
        get_llm().provider = provider
    body = client.get(f"/volunteers/{volunteer_id}/thanks").json()
    assert body["ai"] is False
    assert "[fake]" not in body["text"]
    assert "Спасибо вам за 4,5 ч." in body["text"]
    assert "Вы помогали как фотограф." in body["text"]


def test_thanks_for_newcomer_and_404(client):
    vid = client.post("/volunteers", json=FORM).json()["id"]
    body = client.get(f"/volunteers/{vid}/thanks").json()
    assert "Спасибо, что вы с фондом!" in body["text"]
    assert client.get("/volunteers/999/thanks").status_code == 404
