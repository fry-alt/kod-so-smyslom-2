"""Сообщение волонтёру в Telegram: прошёл обучение, допустили (T-15), позвали на собеседование (T-59).

Пишем только тем, у кого есть telegram_id (анкета из Mini App), и только если задан
TELEGRAM_BOT_TOKEN. Telegram недоступен — запрос координатора всё равно успешен.
Если сервер не достаёт до api.telegram.org, ходим через прокси TELEGRAM_API_BASE.
В логах — только id волонтёра и причина ошибки: без текста сообщения, токена и ПД.
"""

import logging

import httpx

from app.config import get_settings
from app.models import Volunteer

log = logging.getLogger(__name__)

TIMEOUT = 5  # секунд: координатор не должен долго ждать из-за Telegram

MESSAGES = {
    "trained": (
        "Вы прошли обучение — спасибо! 🎓\n"
        "Координатор фонда «Дети Марии» посмотрит вашу анкету и скоро с вами свяжется."
    ),
    "approved": (
        "Вас допустили к волонтёрству в фонде «Дети Марии»! 🎉\n"
        "Откройте приложение — там задачи, на которые можно откликнуться."
    ),
}


def status_changed(volunteer: Volunteer, old_status: str) -> None:
    """Вызывать после сохранения нового статуса."""
    text = MESSAGES.get(volunteer.status)
    if volunteer.status == old_status or text is None:
        return
    send(volunteer, text, volunteer.status)


def send(volunteer: Volunteer, text: str, what: str) -> bool:
    """Отправить волонтёру сообщение. False — не ушло (нет Telegram, токена или Telegram недоступен).
    what — короткое название сообщения для лога вместо его текста."""
    settings = get_settings()
    token = settings.telegram_bot_token
    if not token or not volunteer.telegram_id:
        return False
    base = settings.telegram_api_base.rstrip("/") or "https://api.telegram.org"
    try:
        response = httpx.post(
            f"{base}/bot{token}/sendMessage",
            json={"chat_id": volunteer.telegram_id, "text": text},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        # 403 — волонтёр не запускал бота или заблокировал его
        log.warning(
            "Telegram не принял сообщение волонтёру %s: %s", volunteer.id, e.response.status_code
        )
        return False
    except httpx.HTTPError as e:
        # текст исключения httpx может содержать адрес с токеном — пишем только тип
        log.warning(
            "Telegram недоступен, волонтёр %s без уведомления: %s", volunteer.id, type(e).__name__
        )
        return False
    log.info("Волонтёру %s отправлено уведомление «%s»", volunteer.id, what)
    return True
