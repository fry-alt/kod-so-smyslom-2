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


def indexed(volunteer_ids: list[int]) -> list[int]:
    """Кто из заданных волонтёров есть в индексе. Нет, если эмбеддинг не получился при анкете
    или после смены провайдера эмбеддингов (у каждого своя коллекция)."""
    if not volunteer_ids:
        return []
    found = get_collection("volunteers").get(ids=[str(i) for i in volunteer_ids], include=[])
    return [int(i) for i in found["ids"]]


def nearest(embedding: list[float], volunteer_ids: list[int], limit: int) -> dict[int, float]:
    """Ближайшие по смыслу среди заданных id → {id: сходство 0..1}. Кого нет в индексе — пропускаем:
    Chroma на чужой id в query(ids=…) падает с «Error finding id», поэтому сначала спрашиваем, кто есть."""
    present = indexed(volunteer_ids)
    if not present:
        return {}
    found = get_collection("volunteers").query(
        query_embeddings=[embedding],
        ids=[str(i) for i in present],
        n_results=min(limit, len(present)),
        include=["distances"],
    )
    return {
        int(i): max(0.0, 1.0 - distance)  # коллекция с косинусной дистанцией
        for i, distance in zip(found["ids"][0], found["distances"][0], strict=True)
    }


def update_metadata(volunteer_id: int, metadata: dict[str, Any]) -> None:
    """Обновить статус и т.п. без пересчёта эмбеддинга. Если волонтёра нет в индексе — ничего."""
    get_collection("volunteers").update(ids=[str(volunteer_id)], metadatas=[metadata])
