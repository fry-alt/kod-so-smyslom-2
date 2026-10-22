"""Умный поиск волонтёров для координатора. Схема — docs/ARCHITECTURE.md, «Умный поиск».

1. Разбор запроса (LLM) → ParsedQuery; для роли без текста — прямо из полей роли.
   Подбор под возможность: роль возможности + её время, регион и формат (они важнее текста).
2. Жёсткий фильтр в БД: статус, время, регион, очно/онлайн. Никого не осталось — ослабляем
   время, потом регион, и пишем об этом в «Как я понял запрос» (notes).
3. Векторы: TOP_K ближайших по смыслу среди отфильтрованных.
4. LLM одним вызовом ставит оценку 0–100 и пишет причину.
   Не вышло — фолбэк: сходство × 70 + доля совпавших навыков × 30, ai=False.
На заглушке fake шаги 1 и 4 пропускаем: она не понимает текст, и её «разбор» отсекал бы
нужных людей случайными фильтрами. Поиск на fake — тот же фолбэк (hit@3 10/10, docs/METRICS.md).
В LLM уходят только текст запроса и обезличенные анкеты с id. Имена подставляем после.
"""

import logging
import re
import time

from chromadb.errors import ChromaError
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.llm.client import get_llm
from app.llm.prompts import load_prompt
from app.llm.providers import LLMError
from app.models import Interaction, Opportunity, Volunteer
from app.schemas import Candidate, ParsedQuery, Role, SearchRequest, SearchResponse
from app.services import opportunities, volunteer_index, volunteers
from app.services.roles import load_roles

log = logging.getLogger(__name__)

TOP_K = 10  # сколько кандидатов отдаём LLM на переранжирование: столько показывает экран поиска;
# каждый лишний — это оценка и фраза в ответе модели, то есть секунды ожидания (docs/METRICS.md)
STEM = 6  # сколько первых букв навыка сравниваем с анкетой — грубо, но без морфологии
QUERY_STOP_WORDS = {"нужен", "нужна", "нужно", "нужны", "ищем", "который", "которая", "можно"}
QUERY_STOP_WORDS |= {"помочь", "помощь", "волонтер", "волонтёр", "человек", "кто-то", "чтобы"}
QUERY_STOP_WORDS |= {"роль", "возможность"}  # подписи из request_text


class SearchError(Exception):
    """Ошибка в запросе координатора — показываем её текст как есть."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class RerankItem(BaseModel):
    id: int
    score: int = Field(ge=0, le=100)
    reason: str = Field(description="почему подходит, одна фраза")


class RerankResult(BaseModel):
    items: list[RerankItem]


def search(session: Session, req: SearchRequest) -> SearchResponse:
    started = time.perf_counter()
    opportunity = None
    if req.opportunity_id is not None:
        opportunity = opportunities.get(session, req.opportunity_id)
        if opportunity is None:
            raise SearchError(f"Возможность {req.opportunity_id} не найдена", status=404)
    role_code = req.role_code or (opportunity.role_code if opportunity else None)
    role = None
    if role_code:
        role = next((r for r in load_roles() if r.code == role_code), None)
        if role is None:
            raise SearchError(f"Роль «{role_code}» не найдена в справочнике", status=404)
    if not req.query.strip() and role is None and opportunity is None:
        raise SearchError("Напишите, кого ищете, или выберите роль")

    request = request_text(req.query, role, opportunity)
    parsed = parse_query(req.query, role, opportunity)
    regions = {parsed.region} if parsed.region else set(role.regions if role else [])
    pool, dropped = filtered_pool(
        list(session.exec(select(Volunteer)).all()), parsed, regions, req.statuses
    )

    documents = {v.id: volunteers.index_document(v) for v in pool}
    shortlist = max(TOP_K, req.limit)
    similarity = vector_similarity(
        f"{request}\n{', '.join(parsed.skills)}", list(documents), shortlist
    )
    # с чем сверяем анкеты; запрос не разобран (LLM недоступна) — со словами самого запроса
    terms = parsed.skills or query_words(request)
    what = "по навыкам" if parsed.skills else "по словам запроса"
    matched = {i: matched_skills(terms, doc) for i, doc in documents.items()}

    def closeness(v: Volunteer) -> tuple[float, int]:
        return similarity.get(v.id, 0.0), len(matched[v.id])

    top = sorted(pool, key=closeness, reverse=True)[:shortlist]
    ai = rerank(request, parsed, {v.id: documents[v.id] for v in top})

    candidates = []
    for v in top:
        if v.id in ai:
            score, reason = ai[v.id].score, ai[v.id].reason
        else:
            share = len(matched[v.id]) / len(terms) if terms else 0.0
            score = round(similarity.get(v.id, 0.0) * 70 + share * 30)
            reason = (
                f"совпадение {what}: {', '.join(matched[v.id])}"
                if matched[v.id]
                else "похож по описанию анкеты"
            )
        candidates.append(
            Candidate(
                volunteer=volunteers.to_out(session, v),
                score=min(score, 100),
                reason=reason,
                matched_skills=matched[v.id],
                ai=v.id in ai,
            )
        )
    candidates.sort(key=lambda c: c.score, reverse=True)
    candidates = candidates[: req.limit]

    ms = (time.perf_counter() - started) * 1000
    session.add(
        Interaction(
            kind="search",
            question=req.query.strip()
            or (f"возможность «{opportunity.title}»" if opportunity else f"роль {role_code}"),
            answer=f"{len(candidates)} из {len(pool)}, AI: {'да' if ai else 'нет'}, {ms:.0f} мс",
        )
    )
    session.commit()
    log.info("search: %d из %d за %.0f мс, AI=%s", len(candidates), len(pool), ms, bool(ai))
    if dropped and pool:
        # чипсы остаются как поняли запрос, а в пометке — что пришлось ослабить
        conditions = "этих условий" if len(dropped) > 1 else "этого условия"
        note = f"Никого не нашлось {' и '.join(dropped)} — показываю без {conditions}"
        parsed = parsed.model_copy(update={"notes": ". ".join(filter(None, [note, parsed.notes]))})
    return SearchResponse(parsed=parsed, candidates=candidates, total_checked=len(pool))


def filtered_pool(
    everyone: list[Volunteer], parsed: ParsedQuery, regions: set[str], statuses: list[str]
) -> tuple[list[Volunteer], list[str]]:
    """Жёсткий фильтр. Никого не осталось — ослабляем: сначала время, потом регион.

    Статус и очно/онлайн не трогаем. Возвращаем и список ослабленных условий — для пометки.
    Переранжирование всё равно видит исходный запрос и оценит неподходящих по времени ниже.
    """
    dropped: list[str] = []
    pool = [v for v in everyone if passes_filter(v, parsed, regions, statuses)]
    if not pool and parsed.availability:
        parsed = parsed.model_copy(update={"availability": []})
        dropped.append("в это время")
        pool = [v for v in everyone if passes_filter(v, parsed, regions, statuses)]
    if not pool and regions and parsed.format != "online":
        regions = set()
        dropped.append("в этом регионе")
        pool = [v for v in everyone if passes_filter(v, parsed, regions, statuses)]
    return pool, dropped


def request_text(query: str, role: Role | None, opportunity: Opportunity | None = None) -> str:
    parts = [f"Роль: {role.title}. {role.description}"] if role else []
    if opportunity:
        parts.append(f"Возможность: {opportunity.title}. {opportunity.description}".strip())
    if query.strip():
        parts.append(query.strip())
    return "\n".join(parts)


def parse_query(
    query: str, role: Role | None, opportunity: Opportunity | None = None
) -> ParsedQuery:
    """Запрос словами → ParsedQuery. Роль без текста разбирать не нужно — берём её поля.
    У возможности время, регион и формат уже известны — они заменяют разобранные из текста."""
    from_role = (
        ParsedQuery(
            skills=role.skills,
            availability=role.availability,
            kind=role.kind,
            format=role.format,
            notes="",
        )
        if role
        else ParsedQuery(skills=[], availability=[], kind="any", notes="")
    )
    parsed = from_role
    if query.strip() and llm_understands():
        try:
            parsed = get_llm().chat_json(
                load_prompt("search_query", request=request_text(query, role, opportunity)),
                ParsedQuery,
                system=load_prompt("system"),
            )
        except LLMError as e:
            log.warning("Запрос не разобран, ищем без фильтров по тексту: %s", e)
    if opportunity:
        parsed = parsed.model_copy(
            update={
                "availability": [opportunities.time_slot(opportunity.starts_at)],
                "region": opportunity.region,
                "format": opportunity.format,
            }
        )
    return parsed


def llm_understands() -> bool:
    return get_llm().provider.name != "fake"


def passes_filter(
    v: Volunteer, parsed: ParsedQuery, regions: set[str], statuses: list[str]
) -> bool:
    answers = v.answers
    if statuses and v.status not in statuses:
        return False
    if not statuses and v.status == "paused":
        return False
    if parsed.availability and not set(parsed.availability) & set(answers["availability"]):
        return False
    if parsed.format and answers["formats"] and parsed.format not in answers["formats"]:
        return False
    # онлайн-задачам регион неважен
    return not (regions and parsed.format != "online" and answers["region"] not in regions)


def vector_similarity(text: str, volunteer_ids: list[int], limit: int) -> dict[int, float]:
    """{id: сходство 0..1} для limit ближайших. Эмбеддинги или индекс недоступны — пустой словарь."""
    if not volunteer_ids:
        return {}
    try:
        embedding = get_llm().embed([text], kind="query")[0]
    except LLMError as e:
        log.warning("Эмбеддинги недоступны, ранжируем по навыкам: %s", e)
        return {}
    try:
        return volunteer_index.nearest(embedding, volunteer_ids, limit)
    except ChromaError as e:
        # индекс сломан или не совпала размерность векторов — ищем без него, а не отвечаем 500
        log.warning("Векторный индекс недоступен, ранжируем по навыкам: %s", e)
        return {}


def matched_skills(skills: list[str], document: str) -> list[str]:
    """Навыки, которые встречаются в анкете. Сравниваем по началу слова: «керамика» ~ «керамической»."""
    text = document.lower().replace("ё", "е")
    return [s for s in skills if s.lower().replace("ё", "е")[:STEM] in text]


def query_words(query: str) -> list[str]:
    """Значимые слова запроса — для фолбэка, когда LLM не разобрала запрос."""
    words = re.findall(r"\w{4,}", query.lower())
    return list(dict.fromkeys(w for w in words if w not in QUERY_STOP_WORDS))


def rerank(request: str, parsed: ParsedQuery, documents: dict[int, str]) -> dict[int, RerankItem]:
    """Оценки LLM по id. Пустой словарь — LLM недоступна или вернула чужие id (тогда фолбэк)."""
    if not documents or not llm_understands():
        return {}
    wanted = [
        ("Навыки", ", ".join(parsed.skills)),
        ("Когда", ", ".join(volunteers.AVAILABILITY[a] for a in parsed.availability)),
        ("Регион", volunteers.REGION[parsed.region] if parsed.region else ""),
        ("Формат", volunteers.FORMAT[parsed.format] if parsed.format else ""),
        ("Помощь", volunteers.REGULARITY[parsed.kind]),
        ("Важно", parsed.notes),
    ]
    request += "".join(f"\n{label}: {value}" for label, value in wanted if value)
    candidates = "\n\n".join(f"id: {i}\n{doc}" for i, doc in documents.items())
    try:
        result = get_llm().chat_json(
            load_prompt("rerank", request=request, candidates=candidates),
            RerankResult,
            system=load_prompt("system"),
        )
    except LLMError as e:
        log.warning("Переранжирование не удалось, оценка без AI: %s", e)
        return {}
    items = {item.id: item for item in result.items}
    if not items or not set(items) <= set(documents):
        log.warning("LLM вернула чужие id %s, оценка без AI", sorted(set(items) - set(documents)))
        return {}
    return items
