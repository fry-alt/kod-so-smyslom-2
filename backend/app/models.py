"""Таблицы БД. Пример — журнал обращений; новые таблицы добавляйте рядом.

Поля-словари (ответы анкеты, профиль, вопросы теста) хранятся как JSON.
Менять такой словарь «на месте» нельзя — SQLAlchemy не заметит; присваивайте новый.
"""

from datetime import UTC, datetime
from typing import Any

from pydantic import NaiveDatetime
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(UTC)


class Interaction(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now)
    channel: str = "api"  # откуда пришёл вопрос: api | bot | web | miniapp
    user_id: str | None = Field(default=None, index=True)
    kind: str = "chat"  # chat | ask | case
    question: str
    answer: str


class Volunteer(SQLModel, table=True):
    """Волонтёр. name, contact, telegram_id — персональные данные: в LLM и индекс не уходят."""

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now)
    name: str
    contact: str
    telegram_id: int | None = Field(default=None, index=True)
    answers: dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))  # schemas.Answers
    profile: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))  # schemas.Profile
    status: str = Field(default="new", index=True)  # schemas.VolunteerStatus
    hours: float = 0


class Note(SQLModel, table=True):
    """Заметка координатора о волонтёре. В LLM не отправляется."""

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now)
    volunteer_id: int = Field(foreign_key="volunteer.id", index=True)
    author: str = "координатор"
    text: str


class QuizCache(SQLModel, table=True):
    """Сгенерированный LLM тест по модулю — один на модуль, с правильными ответами."""

    module_id: str = Field(primary_key=True)
    created_at: datetime = Field(default_factory=_now)
    # [{"question": ..., "options": [...], "correct": 0}, ...]
    questions: list[dict[str, Any]] = Field(sa_column=Column(JSON, nullable=False))


class QuizAttempt(SQLModel, table=True):
    """Попытка пройти тест. Балл волонтёра — среднее лучших попыток по модулям."""

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now)
    volunteer_id: int = Field(foreign_key="volunteer.id", index=True)
    module_id: str
    score: int  # % правильных


class Opportunity(SQLModel, table=True):
    """Задача или мероприятие фонда, на которое зовём волонтёров."""

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now)
    title: str
    description: str = ""
    role_code: str | None = None  # роль из data/roles.json
    starts_at: NaiveDatetime  # местное время мероприятия, по нему считаем «будни утром» и т. п.
    region: str = "moscow"  # schemas.Region
    format: str = "offline"  # schemas.Format
    place: str = ""
    slots: int = 1
    hours: float = 3  # сколько часов начислить за участие


class Participation(SQLModel, table=True):
    """Отклик или приглашение волонтёра на возможность. Одна запись на пару «волонтёр — возможность»."""

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now)
    opportunity_id: int = Field(foreign_key="opportunity.id", index=True)
    volunteer_id: int = Field(foreign_key="volunteer.id", index=True)
    status: str = "responded"  # schemas.ParticipationStatus
    hours: float = 0  # начислено после attended


class Interview(SQLModel, table=True):
    """Видеособеседование координатора с волонтёром. Комната звонка — /call/<token>."""

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now)
    volunteer_id: int = Field(foreign_key="volunteer.id", index=True)
    starts_at: NaiveDatetime  # местное время, как его указал координатор
    status: str = "scheduled"  # schemas.InterviewStatus
    token: str = Field(index=True, unique=True)  # случайная строка: знает ссылку — может войти
    notified: bool = False  # ссылка ушла волонтёру в Telegram


class InterviewResult(SQLModel, table=True):
    """Итог собеседования (T-66). Как и заметки — только для фонда: в LLM и в индекс не уходит."""

    interview_id: int = Field(foreign_key="interview.id", primary_key=True)
    created_at: datetime = Field(default_factory=_now)  # когда сохранили последний раз
    motivation: int  # 1–5
    readiness: int  # 1–5, готовность к работе с подопечными
    regularity: int  # 1–5, насколько надёжно будет приходить
    decision: str  # schemas.Decision
    roles: list[str] = Field(sa_column=Column(JSON, nullable=False))  # коды из data/roles.json
    comment: str = ""


class InterviewPlan(SQLModel, table=True):
    """AI-план собеседования (T-66). Хранится, чтобы вопросы не менялись во время звонка.
    Зависит только от анкеты, поэтому один на волонтёра."""

    volunteer_id: int = Field(foreign_key="volunteer.id", primary_key=True)
    created_at: datetime = Field(default_factory=_now)
    questions: list[dict[str, Any]] = Field(sa_column=Column(JSON, nullable=False))  # PlanQuestion
    focus: list[str] = Field(sa_column=Column(JSON, nullable=False))


class Account(SQLModel, table=True):
    """Вход на сайт по почте и паролю. Почта — персональные данные: в LLM и индекс не уходит.
    Пароль хранится только хэшем (services/accounts.py)."""

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now)
    email: str = Field(index=True, unique=True)  # в нижнем регистре
    password_hash: str
    role: str = "volunteer"  # schemas.AccountRole
    volunteer_id: int | None = Field(
        default=None, foreign_key="volunteer.id"
    )  # анкета, если уже заполнена
    token: str = Field(
        index=True, unique=True
    )  # ключ входа: сайт присылает его в заголовке Authorization


class AccountLook(SQLModel, table=True):
    """Оформление личного кабинета: аватар, обложка, стикеры, как обращаться.
    Отдельная таблица, а не поля Account, — create_all добавит её и в уже работающую базу."""

    account_id: int = Field(foreign_key="account.id", primary_key=True)
    avatar: str = ""  # эмодзи; пусто — первая буква имени
    color: str = "blue"  # schemas.LookColor
    cover: str = "sky"  # schemas.LookCover
    stickers: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    nickname: str = ""  # пусто — имя из анкеты


class Dialog(SQLModel, table=True):
    """Переписка фонда с волонтёром (T-100): одна на волонтёра, со стороны фонда пишет любой координатор.
    Текст переписки — персональные данные: в LLM и в индекс не уходит."""

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now)
    volunteer_id: int = Field(foreign_key="volunteer.id", index=True, unique=True)
    last_at: datetime = Field(default_factory=_now)  # время последнего сообщения — свежие сверху
    volunteer_read_id: int = 0  # id последнего сообщения, которое видел волонтёр
    fund_read_id: int = 0  # … и координатор


class DialogMessage(SQLModel, table=True):
    """Сообщение в переписке. opportunity_id — «о занятии …», если написали с карточки занятия."""

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now)
    dialog_id: int = Field(foreign_key="dialog.id", index=True)
    sender: str  # schemas.Sender: coordinator | volunteer
    text: str
    opportunity_id: int | None = Field(default=None, foreign_key="opportunity.id")


class EmailCode(SQLModel, table=True):
    """Код из письма, пока его не ввели (services/email_codes.py): регистрация или сброс пароля.
    Храним только хэши кодов и хэш пароля — ни самого кода, ни пароля."""

    # своё имя таблицы: прежняя «emailcode» была без purpose, а коды живут 15 минут — переносить нечего
    __tablename__ = "email_codes"

    email: str = Field(primary_key=True)  # в нижнем регистре
    purpose: str = Field(primary_key=True)  # signup | reset
    code_hash: str  # до трёх хэшей через пробел: подходит и код из прошлого письма
    payload: dict[str, Any] = Field(
        sa_column=Column(JSON, nullable=False)
    )  # регистрация: почта, хэш пароля, роль; сброс: пусто
    attempts: int = 0
    sent_at: float  # секунды (time.time())
    expires_at: float


class FundSetting(SQLModel, table=True):
    """Настройки фонда, которые координатор меняет в кабинете («Настройки»), например код фонда."""

    key: str = Field(primary_key=True)
    value: str
