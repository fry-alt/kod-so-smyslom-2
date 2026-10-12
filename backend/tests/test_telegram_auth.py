import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest

from app.api.telegram_auth import InitDataError, validate_init_data
from conftest import BOT_TOKEN


def make_init_data(token: str = BOT_TOKEN, auth_date: int | None = None) -> str:
    """Собирает initData так же, как Telegram, — для тестов и локальной отладки."""
    fields = {
        "auth_date": str(auth_date or int(time.time())),
        "query_id": "AAH-test",
        "user": json.dumps({"id": 42, "first_name": "Аня", "username": "anya"}),
    }
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def test_valid_init_data():
    user = validate_init_data(make_init_data(), BOT_TOKEN)
    assert user.id == 42
    assert user.username == "anya"


def test_wrong_token_rejected():
    with pytest.raises(InitDataError):
        validate_init_data(make_init_data(token="999:OTHER"), BOT_TOKEN)


def test_expired_init_data_rejected():
    with pytest.raises(InitDataError):
        validate_init_data(make_init_data(auth_date=int(time.time()) - 3 * 86400), BOT_TOKEN)


def test_auth_endpoint(client):
    assert client.post("/telegram/auth", json={"init_data": make_init_data()}).json()["id"] == 42
    assert client.post("/telegram/auth", json={"init_data": "hash=bad"}).status_code == 401


def test_chat_with_init_data_header(client):
    headers = {"X-Telegram-Init-Data": make_init_data()}
    assert client.post("/chat", json={"message": "Привет"}, headers=headers).status_code == 200
    headers = {"X-Telegram-Init-Data": "user=%7B%7D&hash=forged"}
    assert client.post("/chat", json={"message": "Привет"}, headers=headers).status_code == 401
