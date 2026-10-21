"""Ответ на вопрос по документам с цитатами. Если в данных ответа нет — честное «не знаю»."""

import logging

from pydantic import BaseModel, Field

from app.llm.client import get_llm
from app.llm.prompts import load_prompt
from app.llm.providers import LLMError
from app.rag.retrieve import retrieve
from app.schemas import AskResponse
from app.services.assistant import REFUSAL, TAG_RE, clean, looks_like_injection

log = logging.getLogger(__name__)

NOT_FOUND = "Не знаю: в документах фонда этого нет. Спросите координатора."
LLM_FAILED = (
    "Не получилось составить ответ. Ниже — подходящие места из документов фонда. "
    "Если там нет ответа, спросите координатора."
)


class RagAnswer(BaseModel):
    found: bool = Field(description="есть ли ответ во фрагментах")
    answer: str = Field(description="ответ пользователю")
    sources: list[int] = Field(default_factory=list, description="номера использованных фрагментов")


def answer_question(question: str, top_k: int | None = None) -> AskResponse:
    # та же защита, что у помощника в чате: грубые инъекции — отказ, телефоны и почты — не в LLM
    if looks_like_injection(question):
        return AskResponse(answer=REFUSAL, found=False, sources=[])
    question = clean(question)
    chunks = retrieve(question, top_k)
    if not chunks:
        return AskResponse(answer=NOT_FOUND, found=False, sources=[])

    context = "\n\n".join(
        f"[{i}] источник: {c.source}\n{TAG_RE.sub('', c.text)}" for i, c in enumerate(chunks, 1)
    )
    try:
        result = get_llm().chat_json(
            load_prompt("rag_answer", context=context, question=question),
            RagAnswer,
            system=load_prompt("system"),
        )
    except LLMError as e:
        # модель недоступна — отдаём найденные фрагменты, пусть человек прочитает сам
        log.warning("RAG: LLM не ответила, показываем фрагменты. %s", e)
        return AskResponse(answer=LLM_FAILED, found=False, sources=chunks[:2])
    if not result.found:
        return AskResponse(answer=NOT_FOUND, found=False, sources=[])

    cited = [chunks[i - 1] for i in result.sources if 1 <= i <= len(chunks)]
    # модель ответила, но номера не указала — показываем самый релевантный фрагмент
    return AskResponse(answer=result.answer, found=True, sources=cited or chunks[:1])
