"""SQLite через SQLModel. Сессия выдаётся в эндпоинты через Depends(get_session)."""

from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from app import models  # noqa: F401 — регистрирует таблицы в SQLModel.metadata
from app.config import get_settings


@lru_cache
def get_engine() -> Engine:
    url = get_settings().database_url
    if url.startswith("sqlite:///"):
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    return create_engine(url, connect_args={"check_same_thread": False})


# create_all создаёт новые таблицы, но не добавляет новые колонки в уже созданные.
# Колонки, появившиеся позже, дописываем сами: (таблица, колонка, SQL-описание).
NEW_COLUMNS = [
    ("account", "name", "VARCHAR NOT NULL DEFAULT ''"),
]


def init_db() -> None:
    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        for table, column, ddl in NEW_COLUMNS:
            if column not in {c["name"] for c in inspect(conn).get_columns(table)}:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
