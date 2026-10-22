"""Mini App узнаёт волонтёра по Telegram (T-140): telegram_id — только из подписи, анкета по Telegram,
вход по почте внутри Telegram связывает аккаунт с анкетой."""

from tests.test_auth import bearer, register
from tests.test_volunteers import FORM

from conftest import FUND_CODE, make_init_data, telegram_headers


def submit(client, headers: dict | None = None, token: str | None = None) -> dict:
    headers = {**(headers or {}), **(bearer(token) if token else {})}
    r = client.post("/volunteers", json=FORM, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_telegram_id_only_from_signed_init_data(client):
    assert FORM["telegram_id"] == 111  # из тела запроса не берём — его может прислать кто угодно
    assert submit(client)["telegram_id"] is None
    assert submit(client, telegram_headers(222))["telegram_id"] == 222
    forged = {"X-Telegram-Init-Data": make_init_data(333, token="999:OTHER")}
    # подпись не сошлась — Telegram не привязываем, но анкета всё равно сохранена
    assert submit(client, forged)["telegram_id"] is None


def test_by_telegram(client):
    assert client.get("/volunteers/by-telegram").status_code == 401  # не из Telegram
    assert client.get("/volunteers/by-telegram", headers=telegram_headers(444)).status_code == 404

    submit(client, telegram_headers(444))
    latest = submit(client, telegram_headers(444))  # заполнил второй раз — открываем последнюю
    submit(client, telegram_headers(555))
    r = client.get("/volunteers/by-telegram", headers=telegram_headers(444))
    assert r.status_code == 200, r.text
    assert r.json()["id"] == latest["id"]


def test_login_in_telegram_picks_up_form_from_telegram(client):
    auth = register(client)
    assert auth["account"]["volunteer_id"] is None
    volunteer = submit(client, telegram_headers(666))  # анкету заполнили в Mini App без входа

    login = {"email": "anna@example.ru", "password": "secret1"}
    r = client.post("/auth/login", json=login, headers=telegram_headers(666))
    assert r.status_code == 200, r.text
    assert r.json()["account"]["volunteer_id"] == volunteer["id"]


def test_login_in_telegram_adds_telegram_to_site_form(client):
    auth = register(client)
    volunteer = submit(client, token=auth["token"])  # анкету заполнили на сайте
    assert volunteer["telegram_id"] is None

    login = {"email": "anna@example.ru", "password": "secret1"}
    client.post("/auth/login", json=login, headers=telegram_headers(777))
    assert client.get(f"/volunteers/{volunteer['id']}").json()["telegram_id"] == 777
    r = client.get("/volunteers/by-telegram", headers=telegram_headers(777))
    assert r.json()["id"] == volunteer["id"]

    # Telegram у анкеты уже есть — другим не перезаписываем
    client.post("/auth/login", json=login, headers=telegram_headers(888))
    assert client.get(f"/volunteers/{volunteer['id']}").json()["telegram_id"] == 777


def test_coordinator_login_in_telegram_links_nothing(client):
    submit(client, telegram_headers(999))
    auth = register(client, email="coord@example.ru", role="coordinator", code=FUND_CODE)
    login = {"email": "coord@example.ru", "password": "secret1"}
    r = client.post("/auth/login", json=login, headers=telegram_headers(999))
    assert r.json()["account"]["volunteer_id"] is None
    assert auth["account"]["role"] == "coordinator"
