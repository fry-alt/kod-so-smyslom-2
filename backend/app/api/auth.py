"""Вход на сайт: регистрация, вход и «кто я». Сайт присылает ключ в заголовке Authorization: Bearer <token>."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.models import Account
from app.schemas import AccountOut, AuthOut, LoginIn, Look, RegisterIn
from app.services import accounts

router = APIRouter(prefix="/auth", tags=["auth"])


def current_account(
    authorization: Annotated[str | None, Header()] = None,
    session: Session = Depends(get_session),
) -> Account | None:
    """Зависимость: аккаунт по заголовку Authorization или None, если человек не входил."""
    token = (authorization or "").removeprefix("Bearer ").strip()
    return accounts.by_token(session, token)


@router.post("/register", response_model=AuthOut)
def register(data: RegisterIn, session: Session = Depends(get_session)) -> AuthOut:
    try:
        return accounts.register(session, data)
    except accounts.AuthError as e:
        raise HTTPException(400, str(e)) from e


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
