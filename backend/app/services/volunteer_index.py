"""Векторный индекс волонтёров: Chroma, коллекция volunteers_<бэкенд эмбеддингов>.

Сюда попадают только обезличенные данные — ответы анкеты и теги профиля.
Имя, контакт, telegram_id и заметки координатора — никогда (152-ФЗ, договорённость с фондом).
Текст документа и metadata готовит services/volunteers.py.
"""

from typing import Any

from app.llm.client import get_llm
from app.rag.store import get_collection


def upsert(volunteer_id: int, document: str, metadata: dict[str, Any]) -> None:
    """Добавить или обновить волонтёра. Может бросить LLMError, если эмбеддинги недоступны."""
    embedding = get_llm().embed([document], kind="doc")[0]
    get_collection("volunteers").upsert(
        ids=[str(volunteer_id)], embeddings=[embedding], documents=[document], metadatas=[metadata]
    )


def update_metadata(volunteer_id: int, metadata: dict[str, Any]) -> None:
    """Обновить статус и т.п. без пересчёта эмбеддинга. Если волонтёра нет в индексе — ничего."""
    get_collection("volunteers").update(ids=[str(volunteer_id)], metadatas=[metadata])
