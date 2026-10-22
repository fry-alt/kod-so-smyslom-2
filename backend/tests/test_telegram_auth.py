import time

import pytest

from app.api.telegram_auth import InitDataError, validate_init_data
from conftest import BOT_TOKEN, make_init_data


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
