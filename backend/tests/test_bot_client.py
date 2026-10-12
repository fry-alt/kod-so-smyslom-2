"""Бот ходит в бэкенд по HTTP — проверяем его клиент против настоящего FastAPI-приложения."""

import asyncio

import httpx
import pytest

from app.db import init_db
from app.main import app
from bot.api_client import BackendClient, BackendError
from bot.handlers import routers


def run(coro):
    return asyncio.run(coro)


def make_client() -> BackendClient:
    init_db()  # ASGITransport не запускает lifespan
    return BackendClient("http://test", transport=httpx.ASGITransport(app=app))


def test_bot_chat_and_upload_and_ask():
    async def scenario():
        api = make_client()
        try:
            assert "[fake]" in await api.chat("Привет", "tg:1")
            uploaded = await api.upload("note.txt", "Смена волонтёра длится два часа".encode())
            assert uploaded["chunks"] == 1
            result = await api.ask("Сколько длится смена волонтёра?", "tg:1")
            assert result["found"] is True
            assert result["sources"][0]["source"] == "note.txt"
        finally:
            await api.close()

    run(scenario())


def test_bot_client_turns_http_errors_into_readable_message():
    async def scenario():
        api = make_client()
        try:
            with pytest.raises(BackendError, match="Формат не поддерживается"):
                await api.upload("virus.exe", b"MZ")
        finally:
            await api.close()

    run(scenario())


def test_bot_routers_are_wired():
    assert [r.name for r in routers] == ["start", "document", "voice", "text"]
