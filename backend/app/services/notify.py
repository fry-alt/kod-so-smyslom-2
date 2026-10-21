"""Сообщение волонтёру в Telegram, когда он прошёл обучение или его допустили (T-15).

Пишем только тем, у кого есть telegram_id (анкета из Mini App), и только если задан
TELEGRAM_BOT_TOKEN. Telegram недоступен — запрос координатора всё равно успешен.
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
    if volunteer.status == old_status or text is None or not volunteer.telegram_id:
        return
    token = get_settings().telegram_bot_token
    if not token:
        return
    try:
        response = httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": volunteer.telegram_id, "text": text},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        # 403 — волонтёр не запускал бота или заблокировал его
        log.warning(
            "Telegram не принял сообщение волонтёру %s: %s", volunteer.id, e.response.status_code
        )
        return
    except httpx.HTTPError as e:
        # текст исключения httpx может содержать адрес с токеном — пишем только тип
        log.warning(
            "Telegram недоступен, волонтёр %s без уведомления: %s", volunteer.id, type(e).__name__
        )
        return
    log.info("Волонтёру %s отправлено уведомление «%s»", volunteer.id, volunteer.status)
