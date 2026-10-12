"""Таблицы БД. Пример — журнал обращений; новые таблицы добавляйте рядом."""

from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


class Interaction(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    channel: str = "api"  # откуда пришёл вопрос: api | bot | web | miniapp
    user_id: str | None = Field(default=None, index=True)
    kind: str = "chat"  # chat | ask | case
    question: str
    answer: str
