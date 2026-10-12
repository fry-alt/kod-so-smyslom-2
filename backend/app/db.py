"""SQLite через SQLModel. Сессия выдаётся в эндпоинты через Depends(get_session)."""

from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path

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


def init_db() -> None:
    SQLModel.metadata.create_all(get_engine())


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
