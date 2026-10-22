"""Аккаунты сайта: регистрация и вход по почте и паролю, роль «волонтёр» или «координатор».

Пароль хранится только хэшем (PBKDF2 из стандартной библиотеки — без новых зависимостей).
Имя, почта и пароль в LLM и в индекс не уходят. Координатором можно стать только с кодом фонда:
координатор меняет его в кабинете («Настройки»), а пока не менял — COORDINATOR_CODE из .env, иначе 1111.
"""

import hashlib
import hmac
import secrets

from sqlmodel import Session, select

from app.config import get_settings
from app.models import Account, AccountLook, FundSetting
from app.schemas import AccountOut, AuthOut, LoginIn, Look, RegisterIn

ITERATIONS = 200_000
DEFAULT_CODE = "1111"
CODE_KEY = "coordinator_code"


class AuthError(ValueError):
    """Понятная человеку причина, почему не получилось войти или зарегистрироваться."""


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), ITERATIONS).hex()
    return f"pbkdf2${ITERATIONS}${salt}${digest}"


def check_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split("$")
    except ValueError:
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations)).hex()
    return hmac.compare_digest(actual, digest)


def to_out(account: Account) -> AccountOut:
    return AccountOut.model_validate(account, from_attributes=True)


def _auth(account: Account) -> AuthOut:
    return AuthOut(token=account.token, account=to_out(account))


def by_email(session: Session, email: str) -> Account | None:
    return session.exec(select(Account).where(Account.email == email.strip().lower())).first()


def by_token(session: Session, token: str) -> Account | None:
    if not token:
        return None
    return session.exec(select(Account).where(Account.token == token)).first()


def coordinator_code(session: Session) -> str:
    """Код фонда для регистрации координатора: из кабинета, иначе из .env, иначе 1111."""
    stored = session.get(FundSetting, CODE_KEY)
    if stored:
        return stored.value
    return get_settings().coordinator_code.strip() or DEFAULT_CODE


def set_coordinator_code(session: Session, code: str) -> str:
    stored = session.get(FundSetting, CODE_KEY) or FundSetting(key=CODE_KEY, value="")
    stored.value = code.strip()
    session.add(stored)
    session.commit()
    return stored.value


def prepare(session: Session, data: RegisterIn) -> dict:
    """Проверить данные регистрации. Возвращает заявку (с хэшем пароля, не самим паролем) для create()."""
    if by_email(session, data.email):
        raise AuthError("Эта почта уже зарегистрирована — войдите")
    if data.role == "coordinator" and not hmac.compare_digest(
        data.code.strip().encode(), coordinator_code(session).encode()
    ):
        raise AuthError("Неверный код фонда. Его выдаёт руководитель фонда")
    name = " ".join(data.name.split())
    if not name:
        raise AuthError("Напишите, как вас зовут")
    return {
        "name": name,
        "email": data.email.strip().lower(),
        "password_hash": hash_password(data.password),
        "role": data.role,
    }


def create(session: Session, payload: dict) -> AuthOut:
    """Создать аккаунт по заявке из prepare() — сразу или после кода из письма (email_codes.py)."""
    if by_email(session, payload["email"]):
        raise AuthError("Эта почта уже зарегистрирована — войдите")
    account = Account(
        name=payload.get("name", ""),  # заявки, отправленные до того, как спросили имя, — без него
        email=payload["email"],
        password_hash=payload["password_hash"],
        role=payload["role"],
        token=secrets.token_urlsafe(32),
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    return _auth(account)


def register(session: Session, data: RegisterIn) -> AuthOut:
    """Регистрация без кода на почту — когда почта не настроена (mail.enabled())."""
    return create(session, prepare(session, data))


def login(session: Session, data: LoginIn) -> AuthOut:
    account = by_email(session, data.email)
    if account is None or not check_password(data.password, account.password_hash):
        raise AuthError("Неверная почта или пароль")
    return _auth(account)


def link_volunteer(session: Session, account: Account, volunteer_id: int) -> None:
    """Анкета, отправленная из аккаунта волонтёра, становится его анкетой (первая — не перезаписываем)."""
    if account.role != "volunteer" or account.volunteer_id is not None:
        return
    account.volunteer_id = volunteer_id
    session.add(account)
    session.commit()


def get_look(session: Session, account: Account) -> Look:
    """Оформление кабинета; если человек ещё ничего не выбирал — по умолчанию."""
    row = session.get(AccountLook, account.id)
    return Look.model_validate(row, from_attributes=True) if row else Look()


def save_look(session: Session, account: Account, look: Look) -> Look:
    look = look.model_copy(update={"nickname": look.nickname.strip()})
    row = session.get(AccountLook, account.id) or AccountLook(account_id=account.id)
    for key, value in look.model_dump().items():
        setattr(row, key, value)
    session.add(row)
    session.commit()
    return look
