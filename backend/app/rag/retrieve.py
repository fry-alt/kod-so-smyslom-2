"""Поиск релевантных фрагментов по вопросу.

Гибридный: сходство по смыслу (эмбеддинги) плюс совпадение слов вопроса с фрагментом.
У эмбеддингов Yandex на коротких русских текстах сходство низкое (0,2–0,3), и нужный фрагмент
проигрывал случайным: «Где взять справку о несудимости?» не находил правила со словами «справку» и «несудимости».
"""

import math
import re

from app.config import get_settings
from app.llm.client import get_llm
from app.rag.store import get_collection
from app.schemas import DocumentsInfo, Source

# насколько слова вопроса поднимают фрагмент: совпали все слова — +0,3 к сходству
KEYWORD_WEIGHT = 0.3
# база фонда маленькая — сравниваем слова со всеми фрагментами, а не только с ближайшими по смыслу
MAX_CANDIDATES = 200
# частые слова вопросов, которые ничего не говорят о теме
QUESTION_WORDS = {
    "можно",
    "нужно",
    "нужна",
    "нужен",
    "какие",
    "какой",
    "какая",
    "сколько",
    "почему",
}


def retrieve(question: str, top_k: int | None = None) -> list[Source]:
    s = get_settings()
    collection = get_collection()
    total = collection.count()
    if total == 0:
        return []
    vector = get_llm().embed([question], kind="query")[0]
    res = collection.query(
        query_embeddings=[vector],
        n_results=min(MAX_CANDIDATES, total),
        include=["documents", "metadatas", "distances"],
    )
    texts = res["documents"][0]
    weights = word_weights(stems(question), [stems(t) for t in texts])
    sources = []
    for text, meta, distance in zip(texts, res["metadatas"][0], res["distances"][0], strict=True):
        score = 1 - distance  # косинусное расстояние → сходство
        overlap = keyword_overlap(weights, stems(text))
        # фрагмент берём, если он близок по смыслу или в нём хотя бы половина слов вопроса
        if score >= s.rag_min_score or overlap >= 0.5:
            hybrid = min(score + KEYWORD_WEIGHT * overlap, 1.0)
            sources.append(
                Source(
                    source=meta["source"], chunk=meta["chunk"], score=round(hybrid, 3), text=text
                )
            )
    sources.sort(key=lambda c: c.score, reverse=True)
    return sources[: top_k or s.rag_top_k]


def stems(text: str) -> set[str]:
    """Значимые слова как «основы» из 5 букв: «справку» и «справка» → «справ»."""
    tokens = re.findall(r"\w+", text.lower().replace("ё", "е"))
    return {t[:5] for t in tokens if len(t) >= 4 and t not in QUESTION_WORDS}


def word_weights(words: set[str], fragments: list[set[str]]) -> dict[str, float]:
    """Редкое слово весит больше частого: «несудимости» есть в одном фрагменте, «взять» — во многих.
    Слова, которых нет ни в одном фрагменте («ждать»), не считаем — по ним всё равно ничего не найти."""
    n = len(fragments)
    counts = {w: sum(w in f for f in fragments) for w in words}
    return {w: math.log(1 + n / c) for w, c in counts.items() if c}


def keyword_overlap(weights: dict[str, float], fragment: set[str]) -> float:
    """Доля «веса» слов вопроса, которые есть во фрагменте: 0 — ни одного, 1 — все."""
    total = sum(weights.values())
    return sum(v for w, v in weights.items() if w in fragment) / total if total else 0.0


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
