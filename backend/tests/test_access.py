"""Кабинет фонда — только координатору (или боту и скриптам со служебным ключом).
Данные волонтёра — только ему самому (аккаунт с анкетой или Telegram, из которого её заполнили) и координатору."""

import importlib

import pytest
from tests.conftest import FUND_CODE, telegram_headers
from tests.test_auth import bearer, register
from tests.test_volunteers import FORM

from app.config import get_settings

# маршруты, через которые видно анкеты, заметки и переписку или меняются статусы и часы
FUND_ONLY = [
    ("GET", "/volunteers"),
    ("GET", "/volunteers/export.csv"),
    ("PATCH", "/volunteers/1"),
    ("GET", "/volunteers/1/notes"),
    ("GET", "/volunteers/1/thanks"),
    ("POST", "/volunteers/1/notes"),
    ("GET", "/dialogs"),
    ("GET", "/dashboard/today"),
    ("GET", "/dashboard/analytics"),
    ("POST", "/search"),
    ("POST", "/case/run"),
    ("POST", "/documents/upload"),
    ("DELETE", "/documents/note.txt"),
    ("POST", "/opportunities"),
    ("POST", "/opportunities/1/invite"),
    ("GET", "/opportunities/1/participants"),
    ("PATCH", "/participations/1"),
    ("POST", "/volunteers/1/interviews"),
    ("GET", "/volunteers/1/interview-plan"),
    ("PUT", "/interviews/1/result"),
]


@pytest.mark.parametrize(("method", "path"), FUND_ONLY)
def test_fund_routes_need_coordinator(anon, method, path):
    assert anon.request(method, path).status_code == 401
    assert anon.request(method, path, headers={"X-Service-Key": "wrong"}).status_code == 401
    volunteer = bearer(register(anon)["token"])
    assert anon.request(method, path, headers=volunteer).status_code == 403


def test_coordinator_and_service_key_get_in(client, anon):
    client.post("/volunteers", json=FORM)
    coord = bearer(register(anon, email="c@fund.ru", role="coordinator", code=FUND_CODE)["token"])
    assert len(anon.get("/volunteers", headers=coord).json()) == 1
    assert anon.get("/dashboard/today", headers=coord).status_code == 200
    assert len(client.get("/volunteers").json()) == 1  # служебный ключ — как у бота и make seed


def test_empty_service_key_lets_no_one_in(anon, monkeypatch):
    monkeypatch.setenv("SERVICE_KEY", "")
    get_settings.cache_clear()
    assert anon.get("/volunteers", headers={"X-Service-Key": ""}).status_code == 401


def test_volunteer_side_stays_open(anon):
    # анкету, каталог возможностей и свободное время для собеседования видно без входа
    assert anon.post("/volunteers", json=FORM).status_code == 200
    assert anon.get("/opportunities").status_code == 200
    assert anon.get("/interviews/slots").status_code == 200
    assert anon.get("/documents").status_code == 200


# маршруты с данными одного волонтёра: {v} — номер анкеты, {i} — номер его собеседования
OWNER_ONLY = [
    ("GET", "/volunteers/{v}", None),
    ("GET", "/volunteers/{v}/training", None),
    ("GET", "/volunteers/{v}/participations", None),
    ("GET", "/volunteers/{v}/interviews", None),
    ("GET", "/opportunities?volunteer_id={v}", None),
    ("GET", "/volunteers/{v}/dialog?reader=volunteer", None),
    ("POST", "/volunteers/{v}/dialog/messages", {"sender": "volunteer", "text": "Здравствуйте"}),
    ("POST", "/volunteers/{v}/dialog/read", {"reader": "volunteer"}),
    ("POST", "/opportunities/{o}/respond", {"volunteer_id": "{v}"}),
    ("POST", "/training/submit", {"volunteer_id": "{v}", "module_id": "nope", "answers": []}),
    ("POST", "/volunteers/{v}/interviews/book", {"starts_at": "2020-01-01T10:00:00"}),
    ("PATCH", "/interviews/{i}", {"status": "canceled"}),
]


@pytest.fixture
def owner(client, anon) -> dict:
    """Волонтёр Анна: вошла на сайт и заполнила анкету; у неё собеседование и есть занятие в каталоге."""
    token = register(anon)["token"]
    volunteer = anon.post("/volunteers", json=FORM, headers=bearer(token)).json()
    interview = client.post(
        f"/volunteers/{volunteer['id']}/interviews", json={"starts_at": "2030-01-01T10:00:00"}
    ).json()
    opportunity = client.post(
        "/opportunities", json={"title": "Мастерская", "starts_at": "2030-01-02T10:00:00"}
    ).json()
    ids = {"v": volunteer["id"], "i": interview["id"], "o": opportunity["id"]}
    return {"headers": bearer(token), "ids": ids}


def _call(anon, owner, method, path, body, headers=None):
    fill = lambda text: text.format(**owner["ids"])  # noqa: E731
    if isinstance(body, dict):
        body = {k: int(fill(v)) if v == "{v}" else v for k, v in body.items()}
    return anon.request(method, fill(path), json=body, headers=headers or {})


@pytest.mark.parametrize(("method", "path", "body"), OWNER_ONLY)
def test_volunteer_data_only_for_owner(anon, owner, method, path, body):
    assert _call(anon, owner, method, path, body).status_code == 401
    stranger = bearer(register(anon, email="boris@example.ru")["token"])
    assert _call(anon, owner, method, path, body, stranger).status_code == 403
    in_telegram = telegram_headers(13)  # чужой Telegram
    assert _call(anon, owner, method, path, body, in_telegram).status_code == 403
    # сам волонтёр проходит проверку (дальше может быть 404/409 по сути запроса, но не 401/403)
    assert _call(anon, owner, method, path, body, owner["headers"]).status_code not in (401, 403)


def test_coordinator_sees_volunteer_and_telegram_owner_too(client, anon, owner):
    v = owner["ids"]["v"]
    coord = bearer(register(anon, email="c@fund.ru", role="coordinator", code=FUND_CODE)["token"])
    assert anon.get(f"/volunteers/{v}", headers=coord).status_code == 200

    tg = anon.post("/volunteers", json=FORM, headers=telegram_headers(77)).json()
    assert anon.get(f"/volunteers/{tg['id']}", headers=telegram_headers(77)).status_code == 200


def test_messages_only_from_own_side(anon, owner):
    v, me = owner["ids"]["v"], owner["headers"]
    as_fund = {"sender": "coordinator", "text": "Пишет фонд"}
    assert (
        anon.post(f"/volunteers/{v}/dialog/messages", json=as_fund, headers=me).status_code == 403
    )
    assert anon.get(f"/volunteers/{v}/dialog?reader=coordinator", headers=me).status_code == 403

    coord = bearer(register(anon, email="c@fund.ru", role="coordinator", code=FUND_CODE)["token"])
    r = anon.post(f"/volunteers/{v}/dialog/messages", json=as_fund, headers=coord)
    assert r.status_code == 200, r.text
    as_volunteer = {"sender": "volunteer", "text": "Пишу за волонтёра"}
    assert (
        anon.post(f"/volunteers/{v}/dialog/messages", json=as_volunteer, headers=coord).status_code
        == 403
    )


def test_volunteer_can_only_cancel_own_interview(anon, owner):
    i, me = owner["ids"]["i"], owner["headers"]
    assert anon.patch(f"/interviews/{i}", json={"status": "done"}, headers=me).status_code == 403
    r = anon.patch(f"/interviews/{i}", json={"status": "canceled"}, headers=me)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "canceled"


def test_api_docs_can_be_turned_off(monkeypatch):
    from fastapi.testclient import TestClient

    import app.main

    monkeypatch.setenv("API_DOCS", "false")
    get_settings.cache_clear()
    try:
        closed = TestClient(importlib.reload(app.main).app)
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert closed.get(path).status_code == 404
    finally:
        monkeypatch.setenv("API_DOCS", "true")
        get_settings.cache_clear()
        importlib.reload(app.main)
