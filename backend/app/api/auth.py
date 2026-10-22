"""Вход на сайт: регистрация, вход и «кто я». Сайт присылает ключ в заголовке Authorization: Bearer <token>."""

import hmac
import time
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlmodel import Session

from app.config import get_settings
from app.db import get_session
from app.models import Account
from app.schemas import (
    AccountOut,
    AuthOut,
    CodeSent,
    EmailIn,
    FundCode,
    LoginIn,
    Look,
    RegisterIn,
    VerifyIn,
)
from app.services import accounts, email_codes, mail

router = APIRouter(prefix="/auth", tags=["auth"])


def current_account(
    authorization: Annotated[str | None, Header()] = None,
    session: Session = Depends(get_session),
) -> Account | None:
    """Зависимость: аккаунт по заголовку Authorization или None, если человек не входил."""
    token = (authorization or "").removeprefix("Bearer ").strip()
    return accounts.by_token(session, token)


LETTERS_PER_HOUR = 10  # писем с кодом с одного адреса — чтобы сайтом не рассылали спам
_letters: dict[str, list[float]] = {}


def _limit_letters(request: Request) -> None:
    """Не больше LETTERS_PER_HOUR писем в час с одного IP (за Caddy — первый адрес из X-Forwarded-For)."""
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "")
    now = time.time()
    recent = [t for t in _letters.get(ip, []) if now - t < 3600]
    if len(recent) >= LETTERS_PER_HOUR:
        raise HTTPException(429, "Слишком много писем с кодом. Попробуйте через час")
    _letters[ip] = [*recent, now]


def _code_error(e: accounts.AuthError) -> HTTPException:
    return HTTPException(getattr(e, "status", 400), str(e))


@router.post("/register", response_model=AuthOut | CodeSent)
def register(
    data: RegisterIn, request: Request, session: Session = Depends(get_session)
) -> AuthOut | CodeSent:
    """Шаг 1: на почту уходит код (CodeSent). Почта на сервере не настроена — сразу AuthOut, как раньше."""
    try:
        if not mail.enabled():
            return accounts.register(session, data)
        payload = accounts.prepare(
            session, data
        )  # сначала понятные ошибки формы, потом лимит писем
        _limit_letters(request)
        return email_codes.start_signup(session, payload)
    except accounts.AuthError as e:
        raise _code_error(e) from e


@router.post("/register/resend", response_model=CodeSent)
def register_resend(
    data: EmailIn, request: Request, session: Session = Depends(get_session)
) -> CodeSent:
    _limit_letters(request)
    try:
        return email_codes.resend_signup(session, data.email)
    except accounts.AuthError as e:
        raise _code_error(e) from e


@router.post("/register/verify", response_model=AuthOut)
def register_verify(data: VerifyIn, session: Session = Depends(get_session)) -> AuthOut:
    """Шаг 2: верный код из письма — аккаунт создан, можно входить."""
    try:
        return email_codes.finish_signup(session, data.email, data.code)
    except accounts.AuthError as e:
        raise _code_error(e) from e


@router.post("/login", response_model=AuthOut)
def login(data: LoginIn, session: Session = Depends(get_session)) -> AuthOut:
    try:
        return accounts.login(session, data)
    except accounts.AuthError as e:
        raise HTTPException(401, str(e)) from e


@router.get("/me", response_model=AccountOut)
def me(account: Account | None = Depends(current_account)) -> AccountOut:
    if account is None:
        raise HTTPException(401, "Войдите заново")
    return accounts.to_out(account)


def logged_in(account: Account | None = Depends(current_account)) -> Account:
    """Зависимость: аккаунт обязателен."""
    if account is None:
        raise HTTPException(401, "Войдите заново")
    return account


@router.get("/look", response_model=Look)
def get_look(
    account: Account = Depends(logged_in), session: Session = Depends(get_session)
) -> Look:
    return accounts.get_look(session, account)


@router.put("/look", response_model=Look)
def save_look(
    look: Look, account: Account = Depends(logged_in), session: Session = Depends(get_session)
) -> Look:
    return accounts.save_look(session, account, look)


def is_service(key: str | None) -> bool:
    """Служебный ключ бота и скриптов (SERVICE_KEY в .env). Пустой ключ в настройках — никого не пускает."""
    expected = get_settings().service_key
    return bool(expected) and hmac.compare_digest((key or "").encode(), expected.encode())


def coordinator(
    account: Account | None = Depends(current_account),
    x_service_key: Annotated[str | None, Header()] = None,
) -> Account | None:
    """Зависимость: пускает только координатора фонда — или бота и скрипты со служебным ключом (тогда None)."""
    if is_service(x_service_key):
        return None
    if account is None:
        raise HTTPException(401, "Войдите заново")
    if account.role != "coordinator":
        raise HTTPException(403, "Это может только координатор фонда")
    return account


@router.get("/fund-code", response_model=FundCode)
def get_fund_code(
    _: Account = Depends(coordinator), session: Session = Depends(get_session)
) -> FundCode:
    return FundCode(code=accounts.coordinator_code(session))


@router.put("/fund-code", response_model=FundCode)
def set_fund_code(
    data: FundCode, _: Account = Depends(coordinator), session: Session = Depends(get_session)
) -> FundCode:
    return FundCode(code=accounts.set_coordinator_code(session, data.code))
