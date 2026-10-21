"""Помощник «Спросить о фонде»: чат по документам фонда (RAG) с защитой от промпт-инъекций.

Как отвечает:
1. Явная попытка сменить роль помощника или вытащить его инструкции — вежливый отказ, LLM не спрашиваем.
2. Телефоны и почты в тексте заменяем пометками — личные данные в LLM не уходят (152-ФЗ).
3. Ищем фрагменты документов фонда по вопросу и по нему вместе с прошлым вопросом — для уточнений («а онлайн?»).
4. LLM отвечает по фрагментам и краткой справке о фонде (промпт assistant.md) и называет номера фрагментов.
5. Проверяем ответ: если в нём куски инструкций — заменяем отказом.
LLM недоступна — показываем найденные фрагменты, пусть человек прочитает сам.
"""

import logging
import re
from functools import lru_cache

from pydantic import BaseModel, Field

from app.llm.client import get_llm
from app.llm.prompts import PROMPTS_DIR, load_prompt
from app.llm.providers import LLMError, Message
from app.rag.retrieve import retrieve
from app.schemas import ChatMessage, Source

log = logging.getLogger(__name__)

MAX_MESSAGE = 1500  # символов: вопрос о фонде короче, а длинная «простыня» — частый приём инъекций
MAX_HISTORY = 8  # последних реплик
MAX_HISTORY_MESSAGE = 1000
MAX_ANSWER = 1500
MAX_SOURCES = 5

REFUSAL = (
    "Я помощник фонда «Дети Марии» и помогаю с вопросами о фонде и волонтёрстве. "
    "Спросите, например, как стать волонтёром или что взять на первое занятие."
)
LLM_FAILED = (
    "Сейчас не получается составить ответ. Ниже — подходящие места из документов фонда. "
    "Если там нет ответа, спросите координатора в Telegram-боте фонда."
)
LLM_FAILED_NO_DOCS = "Сейчас помощник не отвечает. Попробуйте чуть позже или спросите координатора в Telegram-боте фонда."
NO_DOCUMENTS = "(по этому вопросу в документах фонда ничего не нашлось)"
CANARY = "ДМ-ЩИТ"  # метка из assistant.md: если она в ответе, модель пересказывает инструкции

# Грубые попытки сменить роль помощника или вытащить инструкции ловим до LLM.
# Тонкие — на совести промпта (раздел «Безопасность») и проверки ответа.
INJECTION_RE = re.compile(
    r"(игнорируй|игнорь|забудь|не\s+обращай\s+внимани\w*\s+на|сбрось|обойди|отключи)\w*\s+"
    r"(\S+\s+){0,3}?(инструкц|правил|указани|промпт|ограничени|настройк)"
    r"|(ignore|disregard|forget|override|bypass)\s+(\S+\s+){0,3}?(instruction|rule|prompt|guideline)"
    r"|(системн|исходн|скрыт|сво|тво|ваш)\w*\s+(промпт|инструкци\w*\s+(для\s+)?(модел|ии|ai|бот))"
    r"|(покажи|выведи|напиши|повтори|раскрой|перескажи|переведи)\w*\s+(\S+\s+){0,2}?промпт"
    r"|(выведи|повтори|раскрой|перескажи)\w*\s+(сво|тво)\w*\s+(инструкц|правил)"
    r"|system\s*prompt|developer\s+mode|режим\w*\s+(разработчика|без\s+ограничений)|jailbreak|\bDAN\b"
    r"|с\s+этого\s+момента\s+ты|притворись|you\s+are\s+now|\bact\s+as\b|\bpretend\b"
    r"|представь,?\s+что\s+ты\s+(не\s+)?(бот|ии|ai|модель|нейросеть|человек|пират|хакер)"
    r"|<\|?\s*(system|im_start|im_end)|\[/?INST\]|^\s*(system|систем\w*)\s*:",
    re.IGNORECASE | re.MULTILINE,
)
PHONE_RE = re.compile(r"(?<!\d)(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
# служебные теги промпта: их нельзя подделать ни в вопросе, ни в загруженном документе
TAG_RE = re.compile(r"</?\s*(документы_фонда|фрагмент)\b[^>]*>", re.IGNORECASE)


class Reply(BaseModel):
    answer: str
    sources: list[Source] = Field(default_factory=list)
    guarded: bool = False  # сработала защита: LLM не спрашивали или её ответ заменён отказом


class AssistantAnswer(BaseModel):
    answer: str = Field(description="ответ собеседнику")
    sources: list[int] = Field(
        default_factory=list, description="номера фрагментов, на которых основан ответ"
    )


def reply(message: str, history: list[ChatMessage]) -> Reply:
    if looks_like_injection(message):
        log.warning("Помощник: похоже на промпт-инъекцию — отказ без LLM")
        return Reply(answer=REFUSAL, guarded=True)

    llm = get_llm()  # ошибка настройки (нет ключа) — пусть видна сразу, как и в других эндпоинтах
    message = clean(message)[:MAX_MESSAGE]
    past = clean_history(history)
    chunks = find_chunks(message, past)
    system = load_prompt("assistant", documents=documents_block(chunks))
    try:
        result = llm.chat_json(
            [*past, {"role": "user", "content": message}], AssistantAnswer, system=system
        )
    except LLMError as e:
        log.warning("Помощник: LLM не ответила, показываем фрагменты. %s", e)
        if chunks:
            return Reply(answer=LLM_FAILED, sources=chunks[:2])
        return Reply(answer=LLM_FAILED_NO_DOCS)

    answer = result.answer.strip()
    if not answer or leaks_instructions(answer):
        log.warning("Помощник: ответ похож на пересказ инструкций — заменён отказом")
        return Reply(answer=REFUSAL, guarded=True)
    cited = [chunks[i - 1] for i in dict.fromkeys(result.sources) if 1 <= i <= len(chunks)]
    return Reply(answer=shorten(answer), sources=cited)


def looks_like_injection(text: str) -> bool:
    return bool(INJECTION_RE.search(text))


def clean(text: str) -> str:
    """Убираем подделки служебных тегов, телефоны и почты заменяем пометками."""
    text = TAG_RE.sub("", text)
    text = PHONE_RE.sub("[телефон]", text)
    return EMAIL_RE.sub("[почта]", text).strip()


def clean_history(history: list[ChatMessage]) -> list[Message]:
    """Историю присылает браузер — доверяем ей не больше, чем вопросу: подделки выбрасываем, длину режем."""
    return [
        {"role": m.role, "content": clean(m.content)[:MAX_HISTORY_MESSAGE]}
        for m in history[-MAX_HISTORY:]
        if m.content.strip() and not looks_like_injection(m.content)
    ]


def find_chunks(message: str, past: list[Message]) -> list[Source]:
    queries = [message]
    previous = next((m["content"] for m in reversed(past) if m["role"] == "user"), None)
    if (
        previous
    ):  # «а где её взять?» без прошлой темы ничего не найдёт; лучшие места из обоих поисков
        queries.append(f"{previous}\n{message}")
    found: dict[tuple[str, int], Source] = {}
    try:
        for query in queries:
            for c in retrieve(query, MAX_SOURCES):
                key = (c.source, c.chunk)
                if key not in found or c.score > found[key].score:
                    found[key] = c
    except LLMError as e:  # эмбеддинги недоступны — отвечаем по краткой справке о фонде
        log.warning("Помощник: поиск по документам не сработал. %s", e)
    return sorted(found.values(), key=lambda c: c.score, reverse=True)[:MAX_SOURCES]


def documents_block(chunks: list[Source]) -> str:
    if not chunks:
        return NO_DOCUMENTS
    return "\n\n".join(
        f'<фрагмент номер="{i}" источник="{c.source.replace(chr(34), "")}">\n'
        f"{TAG_RE.sub('', c.text)}\n</фрагмент>"
        for i, c in enumerate(chunks, 1)
    )


def leaks_instructions(answer: str) -> bool:
    """Ответ содержит метку или целую фразу из правил промпта — значит, модель пересказывает инструкции."""
    text = _normalize(answer)
    return (
        CANARY.lower() in text
        or "документы_фонда" in text
        or any(p in text for p in _secret_phrases())
    )


@lru_cache
def _secret_phrases() -> list[str]:
    """Фразы из правил (всё до «Кратко о фонде»): справку о фонде и примеры пересказывать можно."""
    rules = (PROMPTS_DIR / "assistant.md").read_text(encoding="utf-8").split("## Кратко о фонде")[0]
    phrases = (_normalize(p).strip(" -—«»#()0123456789") for p in re.split(r"[.!?:;\n]", rules))
    return [p for p in phrases if len(p) >= 40]


def _normalize(text: str) -> str:
    return " ".join(text.lower().replace("ё", "е").split())


def shorten(text: str) -> str:
    if len(text) <= MAX_ANSWER:
        return text
    cut = text[:MAX_ANSWER]
    end = max(cut.rfind(". "), cut.rfind("\n"))
    return cut[: end + 1].strip() if end > 0 else cut + "…"
