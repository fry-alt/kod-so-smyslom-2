"""Поиск релевантных фрагментов по вопросу."""

from app.config import get_settings
from app.llm.client import get_llm
from app.rag.store import get_collection
from app.schemas import DocumentsInfo, Source


def retrieve(question: str, top_k: int | None = None) -> list[Source]:
    s = get_settings()
    collection = get_collection()
    total = collection.count()
    if total == 0:
        return []
    vector = get_llm().embed([question], kind="query")[0]
    res = collection.query(
        query_embeddings=[vector],
        n_results=min(top_k or s.rag_top_k, total),
        include=["documents", "metadatas", "distances"],
    )
    sources = []
    for text, meta, distance in zip(
        res["documents"][0], res["metadatas"][0], res["distances"][0], strict=True
    ):
        score = 1 - distance  # косинусное расстояние → сходство
        if score >= s.rag_min_score:
            sources.append(
                Source(source=meta["source"], chunk=meta["chunk"], score=round(score, 3), text=text)
            )
    return sources


def delete_document(source: str) -> int:
    """Удаляет все чанки файла, возвращает их количество."""
    collection = get_collection()
    ids = collection.get(where={"source": source})["ids"]
    if ids:
        collection.delete(ids=ids)
    return len(ids)


def list_documents() -> DocumentsInfo:
    collection = get_collection()
    metas = collection.get(include=["metadatas"])["metadatas"] or []
    return DocumentsInfo(
        collection=collection.name,
        chunks=len(metas),
        files=sorted({m["source"] for m in metas}),
    )
