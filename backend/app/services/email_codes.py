"""Код подтверждения почты при регистрации — как в Yapp (server/email-codes.js).

Форма → заявка (с хэшем пароля, не самим паролем) хранится в EmailCode, на почту уходит 6-значный код →
аккаунт создаётся только после верного кода. Код живёт 15 минут, 5 попыток, повторно отправить —
не чаще раза в минуту. Храним только хэш кода. Почта в LLM и индекс не уходит.
"""

import hashlib
import hmac
import logging
import re
import secrets
import time

from sqlmodel import Session

from app.models import EmailCode
from app.schemas import AuthOut, CodeSent
from app.services import accounts, mail

log = logging.getLogger(__name__)

CODE_TTL = 15 * 60  # секунд
RESEND_AFTER = 60
MAX_ATTEMPTS = 5
KEEP_CODES = 3  # сколько последних отправленных кодов действуют одновременно


class CodeError(accounts.AuthError):
    """Понятная человеку причина плюс HTTP-статус для ответа."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _hash(email: str, code: str) -> str:
    return hashlib.sha256(f"{email}:signup:{code}".encode()).hexdigest()


def _issue(session: Session, email: str, payload: dict, now: float) -> str:
    """Новый код. Прежние (до KEEP_CODES) тоже действуют, пока не истёк срок. Возвращает код — для письма."""
    prev = session.get(EmailCode, email)
    if prev and now - prev.sent_at < RESEND_AFTER:
        wait = int(RESEND_AFTER - (now - prev.sent_at)) + 1
        raise CodeError(429, f"Код уже отправлен. Новый можно запросить через {wait} с")
    code = f"{secrets.randbelow(1_000_000):06d}"
    # Письма приходят с задержкой: человек жмёт «Отправить ещё раз», а потом вводит код из первого письма.
    # Поэтому новый код не отменяет прежние.
    old = prev.code_hash.split() if prev and prev.expires_at > now else []
    row = prev or EmailCode(email=email, code_hash="", payload={}, sent_at=now, expires_at=now)
    row.code_hash = " ".join([_hash(email, code), *old][:KEEP_CODES])
    row.payload = payload
    row.attempts = 0
    row.sent_at = now
    row.expires_at = now + CODE_TTL
    session.add(row)
    session.commit()
    return code


def _use(session: Session, email: str, code: str, now: float) -> dict:
    """Проверяет код; верный — «гасит» заявку и возвращает её. Неверный — считает попытку."""
    row = session.get(EmailCode, email)
    if row is None or row.expires_at < now:
        raise CodeError(400, "Код устарел — запросите новый")
    if row.attempts >= MAX_ATTEMPTS:
        raise CodeError(429, "Слишком много попыток — запросите новый код")
    given = re.sub(r"\D", "", code)
    mine = _hash(email, given)
    ok = len(given) == 6 and any(hmac.compare_digest(mine, h) for h in row.code_hash.split())
    if not ok:
        row.attempts += 1
        session.add(row)
        session.commit()
        left = MAX_ATTEMPTS - row.attempts
        if left > 0:
            raise CodeError(400, f"Неверный код. Осталось попыток: {left}")
        raise CodeError(400, "Неверный код. Попытки закончились — запросите новый")
    payload = row.payload
    session.delete(row)
    session.commit()
    return payload


def _letter(code: str) -> tuple[str, str, str]:
    """Тема, текст и HTML письма. HTML — простая таблица с инлайн-стилями: почта не понимает внешний CSS."""
    tail = "Если вы не регистрировались на сайте фонда «Дети Марии» — просто не обращайте внимания на это письмо."
    text = (
        f"Ваш код подтверждения почты: {code}\n\nОн действует 15 минут. {tail}\n\n"
        "— Благотворительный фонд «Дети Марии»"
    )
    html = f"""<!doctype html><html lang="ru"><body style="margin:0;background:#eef4f1;font-family:Arial,Helvetica,sans-serif;color:#13231d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4f1;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;padding:32px">
<tr><td style="font-size:22px;font-weight:bold;color:#1f7f4a;padding-bottom:18px">Дети Марии</td></tr>
<tr><td style="font-size:18px;line-height:1.5;padding-bottom:18px">Ваш код подтверждения почты:</td></tr>
<tr><td style="font-size:34px;font-weight:bold;letter-spacing:8px;background:#eef4f1;border-radius:14px;padding:16px;text-align:center">{code}</td></tr>
<tr><td style="font-size:16px;line-height:1.5;color:#55665f;padding-top:18px">Код действует 15 минут. {tail}</td></tr>
</table>
<p style="font-size:13px;color:#55665f">Благотворительный фонд «Дети Марии»</p>
</td></tr></table></body></html>"""
    return f"{code} — код подтверждения почты", text, html


def _deliver(session: Session, email: str, code: str) -> None:
    """Отправка письма; не ушло — снимаем заявку, чтобы человек сразу мог запросить новый код."""
    subject, text, html = _letter(code)
    try:
        mail.send(email, subject, text, html)
    except mail.MailError as e:
        row = session.get(EmailCode, email)
        if row:
            session.delete(row)
            session.commit()
        log.error("Письмо с кодом не отправлено: %s", e)
        raise CodeError(
            502, "Не получилось отправить письмо. Проверьте почту и попробуйте ещё раз через минуту"
        ) from e


def start_signup(session: Session, payload: dict, now: float | None = None) -> CodeSent:
    """Шаг 1: сохранить заявку из accounts.prepare() и отправить код."""
    now = time.time() if now is None else now
    code = _issue(session, payload["email"], payload, now)
    _deliver(session, payload["email"], code)
    return CodeSent(email=payload["email"], resend_after=RESEND_AFTER)


def resend_signup(session: Session, email: str, now: float | None = None) -> CodeSent:
    """Повторная отправка кода по той же заявке."""
    now = time.time() if now is None else now
    email = email.strip().lower()
    row = session.get(EmailCode, email)
    if row is None or row.expires_at < now:
        raise CodeError(400, "Заявка устарела — заполните форму ещё раз")
    code = _issue(session, email, row.payload, now)
    _deliver(session, email, code)
    return CodeSent(email=email, resend_after=RESEND_AFTER)


def finish_signup(session: Session, email: str, code: str, now: float | None = None) -> AuthOut:
    """Шаг 2: верный код — создаём аккаунт."""
    now = time.time() if now is None else now
    payload = _use(session, email.strip().lower(), code, now)
    return accounts.create(session, payload)
