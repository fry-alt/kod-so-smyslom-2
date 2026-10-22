"""Сервер не достаёт до api.telegram.org — бот и уведомления ходят через прокси TELEGRAM_API_BASE (T-152)."""

import asyncio

from tests.test_notify import FORM, approve

from bot.main import make_session
from conftest import BOT_TOKEN, telegram_headers

PROXY = "https://deti-tg.example.workers.dev"


def test_bot_goes_through_proxy():
    session = make_session(PROXY + "/")
    try:
        assert session.api.api_url(BOT_TOKEN, "getMe") == f"{PROXY}/bot{BOT_TOKEN}/getMe"
    finally:
        asyncio.run(session.close())


def test_bot_goes_direct_without_proxy():
    session = make_session("")
    try:
        assert (
            session.api.api_url(BOT_TOKEN, "getMe")
            == f"https://api.telegram.org/bot{BOT_TOKEN}/getMe"
        )
    finally:
        asyncio.run(session.close())


def test_notification_goes_through_proxy(client, telegram, monkeypatch):
    monkeypatch.setenv("TELEGRAM_API_BASE", PROXY + "/")
    from app.config import get_settings

    get_settings.cache_clear()
    r = client.post("/volunteers", json=FORM, headers=telegram_headers(700702))
    approve(client, r.json()["id"])
    assert [m["url"] for m in telegram] == [f"{PROXY}/bot{BOT_TOKEN}/sendMessage"]
