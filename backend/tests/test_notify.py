"""Уведомление волонтёру в Telegram: при допуске и после обучения, без ПД в логах, без падений."""

import logging

import httpx

from app.services import notify
from conftest import BOT_TOKEN, telegram_headers

FORM = {
    "name": "Вера Уведомлённая",
    "contact": "+7 900 000-00-07",
    "answers": {"about": "Студентка, хочу помогать на мастерских", "availability": ["weekend"]},
}


def create(client, telegram_id: int | None = 700700) -> int:
    headers = telegram_headers(telegram_id) if telegram_id else {}
    r = client.post("/volunteers", json=FORM, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def approve(client, volunteer_id: int) -> None:
    r = client.patch(f"/volunteers/{volunteer_id}", json={"status": "approved"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"


def test_approved_sends_message(client, telegram):
    approve(client, create(client))
    assert len(telegram) == 1
    assert telegram[0]["chat_id"] == 700700
    assert "допустили" in telegram[0]["text"]
    assert telegram[0]["url"] == f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"


def test_only_on_change_to_approved_or_trained(client, telegram):
    volunteer_id = create(client)
    client.patch(f"/volunteers/{volunteer_id}", json={"status": "active"})
    client.patch(f"/volunteers/{volunteer_id}", json={"hours": 5})
    assert telegram == []
    approve(client, volunteer_id)
    approve(client, volunteer_id)  # повторно тот же статус — второго сообщения нет
    assert len(telegram) == 1


def test_no_telegram_id_or_no_token(client, telegram, monkeypatch):
    approve(client, create(client, telegram_id=None))
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "")
    from app.config import get_settings

    get_settings.cache_clear()
    approve(client, create(client, telegram_id=700701))
    assert telegram == []


def test_telegram_down_does_not_break_patch(client, monkeypatch, caplog):
    def down(url, json, timeout):
        raise httpx.ConnectError(f"cannot connect to {url}")

    monkeypatch.setattr(notify.httpx, "post", down)
    with caplog.at_level(logging.INFO):
        approve(client, create(client))
    assert "Telegram недоступен" in caplog.text
    assert BOT_TOKEN not in caplog.text
    assert FORM["name"] not in caplog.text and "допустили" not in caplog.text


def test_telegram_refuses_does_not_break_patch(client, monkeypatch, caplog):
    def forbidden(url, json, timeout):
        return httpx.Response(403, request=httpx.Request("POST", url))

    monkeypatch.setattr(notify.httpx, "post", forbidden)
    approve(client, create(client))
    assert "403" in caplog.text
    assert BOT_TOKEN not in caplog.text
