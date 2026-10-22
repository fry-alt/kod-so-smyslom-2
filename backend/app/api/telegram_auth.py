"""Проверка initData из Telegram Mini App.

Алгоритм из документации Telegram (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
    secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
    hash       = hex(HMAC_SHA256(key=secret_key, msg=data_check_string))
где data_check_string — все поля, кроме hash, отсортированные по ключу, в виде key=value через \\n.

Mini App шлёт initData в заголовке X-Telegram-Init-Data.
"""

import hashlib
import hmac
import json
import time
from typing import Annotated
from urllib.parse import parse_qsl

from fastapi import APIRouter, Header, HTTPException

from app.config import get_settings
from app.schemas import TelegramAuthRequest, TelegramUser

router = APIRouter(prefix="/telegram", tags=["telegram"])


class InitDataError(ValueError):
    pass


def validate_init_data(init_data: str, bot_token: str, max_age: int = 86400) -> TelegramUser:
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise InitDataError("в initData нет hash")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received_hash):
        raise InitDataError("подпись initData не совпала")

    auth_date = int(pairs.get("auth_date", "0"))
    if max_age and time.time() - auth_date > max_age:
        raise InitDataError("initData устарели — переоткройте Mini App")
    if "user" not in pairs:
        raise InitDataError("в initData нет user")
    return TelegramUser.model_validate(json.loads(pairs["user"]))


def telegram_user(
    x_telegram_init_data: Annotated[str | None, Header()] = None,
) -> TelegramUser | None:
    """Зависимость для эндпоинтов: пользователь Mini App или None (если заголовка нет и
    TELEGRAM_AUTH_REQUIRED=false). Неверная подпись — всегда 401."""
    s = get_settings()
    if not x_telegram_init_data:
        if s.telegram_auth_required:
            raise HTTPException(401, "Нужен заголовок X-Telegram-Init-Data")
        return None
    if not s.telegram_bot_token:
        raise HTTPException(500, "На сервере не задан TELEGRAM_BOT_TOKEN — initData не проверить")
    try:
        return validate_init_data(
            x_telegram_init_data, s.telegram_bot_token, s.telegram_auth_max_age
        )
    except InitDataError as e:
        raise HTTPException(401, f"Telegram initData: {e}") from e


def verified_telegram_id(
    x_telegram_init_data: Annotated[str | None, Header()] = None,
) -> int | None:
    """Зависимость: id пользователя Telegram, только если подпись initData верна. Никогда не падает:
    не из Telegram, подпись не сошлась или устарела — None (анкета и вход работают и без Telegram)."""
    token = get_settings().telegram_bot_token
    if not x_telegram_init_data or not token:
        return None
    try:
        return validate_init_data(x_telegram_init_data, token).id
    except (InitDataError, ValueError):
        return None


@router.post("/auth", response_model=TelegramUser)
def auth(body: TelegramAuthRequest) -> TelegramUser:
    """Проверить initData и вернуть пользователя (для отладки Mini App)."""
    user = telegram_user(body.init_data)
    if user is None:
        raise HTTPException(401, "initData пустые")
    return user
