"""Кабинет фонда — только координатору (или боту и скриптам со служебным ключом), анкета и отклики — всем."""

import importlib

import pytest
from tests.conftest import FUND_CODE
from tests.test_auth import bearer, register
from tests.test_volunteers import FORM

from app.config import get_settings

# маршруты, через которые видно анкеты, заметки и переписку или меняются статусы и часы
FUND_ONLY = [
    ("GET", "/volunteers"),
    ("GET", "/volunteers/export.csv"),
    ("PATCH", "/volunteers/1"),
    ("GET", "/volunteers/1/notes"),
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
