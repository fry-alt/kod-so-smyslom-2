"""Таблицы БД. Пример — журнал обращений; новые таблицы добавляйте рядом.

Поля-словари (ответы анкеты, профиль, вопросы теста) хранятся как JSON.
Менять такой словарь «на месте» нельзя — SQLAlchemy не заметит; присваивайте новый.
"""

from datetime import UTC, datetime
from typing import Any

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
