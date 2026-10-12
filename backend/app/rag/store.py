"""Векторное хранилище Chroma на диске (CHROMA_DIR).

Имя коллекции зависит от бэкенда эмбеддингов: у разных моделей разная размерность векторов,
поэтому после смены провайдера документы нужно загрузить заново (make ingest).
"""

from functools import lru_cache

import chromadb
from chromadb.api.models.Collection import Collection
from chromadb.config import Settings as ChromaSettings

from app.config import get_settings
from app.llm.providers import resolve_embeddings_provider


def collection_name() -> str:
    s = get_settings()
    backend = resolve_embeddings_provider(s)
    return f"docs_{s.llm_provider if backend == 'provider' else backend}"


@lru_cache
def get_collection() -> Collection:
    s = get_settings()
    s.chroma_dir.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(
        path=str(s.chroma_dir), settings=ChromaSettings(anonymized_telemetry=False)
    )
    return client.get_or_create_collection(collection_name(), metadata={"hnsw:space": "cosine"})
