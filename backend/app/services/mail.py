"""Отправка писем через Yandex Cloud Postbox (API, совместимый с Amazon SES v2) — как в Yapp.

Запрос подписывается статическим ключом сервисного аккаунта (AWS Signature V4, регион ru-central1,
сервис ses) своими силами, без SDK: https://yandex.cloud/ru/docs/postbox/aws-compatible-api/signing-requests

Настройки: POSTBOX_KEY_ID, POSTBOX_SECRET, MAIL_FROM. Без них письмо не уходит, а печатается в лог —
так удобно локально (MAIL_LOG_CODES=true).
"""

import hashlib
import hmac
import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from email.utils import formataddr, parseaddr

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

HOST = "postbox.cloud.yandex.net"
PATH = "/v2/email/outbound-emails"
REGION = "ru-central1"
SERVICE = "ses"
TIMEOUT = 15  # секунд


class MailError(RuntimeError):
    """Письмо не ушло: Postbox недоступен или ответил ошибкой."""


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _hmac(key: bytes, data: str) -> bytes:
    return hmac.new(key, data.encode(), hashlib.sha256).digest()


def sign_request(
    body: bytes, key_id: str, secret: str, now: datetime | None = None
) -> dict[str, str]:
    """Заголовки AWS Signature V4 для POST с JSON-телом. Вынесено отдельно — проверяется тестом."""
    amz_date = (now or datetime.now(UTC)).strftime("%Y%m%dT%H%M%SZ")  # 20261001T120000Z
    day = amz_date[:8]
    headers = {"content-type": "application/json", "host": HOST, "x-amz-date": amz_date}
    names = sorted(headers)
    canonical = "\n".join(
        [
            "POST",
            PATH,
            "",
            *(f"{h}:{headers[h]}" for h in names),
            "",
            ";".join(names),
            _sha256(body),
        ]
    )
    scope = f"{day}/{REGION}/{SERVICE}/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, _sha256(canonical.encode())])
    key = _hmac(_hmac(_hmac(_hmac(f"AWS4{secret}".encode(), day), REGION), SERVICE), "aws4_request")
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    return {
        "Content-Type": "application/json",
        "X-Amz-Date": amz_date,
        "Authorization": f"AWS4-HMAC-SHA256 Credential={key_id}/{scope}, "
        f"SignedHeaders={';'.join(names)}, Signature={signature}",
    }


def sender(mail_from: str) -> str:
    """«Дети Марии <noreply@...>» → имя в кодировке RFC 2047: API Postbox (как SES) не принимает кириллицу
    в адресе отправителя как есть."""
    name, address = parseaddr(mail_from)
    return formataddr((name, address), charset="utf-8") if name else address


def _postbox(to: str, subject: str, text: str, html: str) -> None:
    s = get_settings()
    body = json.dumps(
        {
            "FromEmailAddress": sender(s.mail_from),
            "Destination": {"ToAddresses": [to]},
            "Content": {
                "Simple": {
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": {
                        "Text": {"Data": text, "Charset": "UTF-8"},
                        "Html": {"Data": html, "Charset": "UTF-8"},
                    },
                }
            },
        },
        ensure_ascii=False,
    ).encode()
    headers = sign_request(body, s.postbox_key_id, s.postbox_secret)
    try:
        r = httpx.post(f"https://{HOST}{PATH}", content=body, headers=headers, timeout=TIMEOUT)
    except httpx.HTTPError as e:
        raise MailError(f"Postbox недоступен: {type(e).__name__}") from e
    if r.status_code >= 400:
        raise MailError(f"Postbox: HTTP {r.status_code} {r.text[:200]}")


def _to_log(to: str, subject: str, text: str, html: str) -> None:
    log.warning(
        "Письмо (почта не настроена) → %s\n  %s\n  %s", to, subject, text.replace("\n", "\n  ")
    )


def configured() -> bool:
    s = get_settings()
    return bool(s.postbox_key_id and s.postbox_secret and s.mail_from)


Mailer = Callable[[str, str, str, str], None]
_override: Mailer | None = None


def set_mailer(fn: Mailer | None) -> None:
    """Для тестов: подменить отправку (fn получает to, subject, text, html). None — вернуть обычную."""
    global _override
    _override = fn


def enabled() -> bool:
    """Можно ли отправлять письма: Postbox настроен, или код можно печатать в лог (локально).
    На проде без Postbox коды выключены и регистрация идёт без письма — чтобы выкладка кода
    раньше настройки почты не закрыла регистрацию."""
    return _override is not None or configured() or get_settings().mail_log_codes


def send(to: str, subject: str, text: str, html: str) -> None:
    if _override is not None:
        _override(to, subject, text, html)
    elif configured():
        _postbox(to, subject, text, html)
    else:
        _to_log(to, subject, text, html)
