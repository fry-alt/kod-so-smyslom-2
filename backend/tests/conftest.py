"""Все тесты идут на провайдере fake: без сети и ключей, с временными БД и Chroma."""

from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import get_engine
from app.llm.client import get_llm
from app.rag.store import get_collection

DEMO_DIR = Path(__file__).resolve().parents[2] / "data" / "demo"
BOT_TOKEN = "123456:TEST-TOKEN"


def _clear_caches() -> None:
    for cached in (get_settings, get_llm, get_engine, get_collection):
        cached.cache_clear()


@pytest.fixture(autouse=True)
def test_env(tmp_path, monkeypatch):
    # переменные окружения важнее .env — локальный .env разработчика тестам не мешает
    env = {
        "LLM_PROVIDER": "fake",
        "EMBEDDINGS_PROVIDER": "auto",
        "CHROMA_DIR": str(tmp_path / "chroma"),
        "UPLOADS_DIR": str(tmp_path / "uploads"),
        "DATABASE_URL": f"sqlite:///{(tmp_path / 'app.db').as_posix()}",
        "TELEGRAM_BOT_TOKEN": BOT_TOKEN,
        "TELEGRAM_AUTH_REQUIRED": "false",
        "RAG_AUTOLOAD": "false",  # тесты сами решают, какие документы загрузить
    }
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    _clear_caches()
    yield
    _clear_caches()


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def telegram(monkeypatch) -> list[dict]:
    """Вместо Telegram Bot API — список отправленных сообщений. Тесты никогда не пишут в настоящий Telegram."""
    sent: list[dict] = []

    def post(url, json, timeout):
        sent.append({"url": url, **json})
        return httpx.Response(200, request=httpx.Request("POST", url))

    monkeypatch.setattr("app.services.notify.httpx.post", post)
    return sent


@pytest.fixture(autouse=True)
def mailbox() -> list[dict]:
    """Вместо Postbox — список отправленных писем. Тесты никогда не шлют настоящую почту."""
    from app.api import auth
    from app.services import mail

    sent: list[dict] = []
    mail.set_mailer(
        lambda to, subject, text, html: sent.append({"to": to, "subject": subject, "text": text})
    )
    auth._letters.clear()
    yield sent
    mail.set_mailer(None)
