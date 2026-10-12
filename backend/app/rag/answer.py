"""Ответ на вопрос по документам с цитатами. Если в данных ответа нет — честное «не знаю»."""

from pydantic import BaseModel, Field

from app.llm.client import get_llm
from app.llm.prompts import load_prompt
from app.rag.retrieve import retrieve
from app.schemas import AskResponse

NOT_FOUND = (
    "В загруженных документах нет ответа на этот вопрос. "
    "Попробуйте переформулировать или обратитесь к сотруднику организации."
)


class RagAnswer(BaseModel):
    found: bool = Field(description="есть ли ответ во фрагментах")
    answer: str = Field(description="ответ пользователю")
    sources: list[int] = Field(default_factory=list, description="номера использованных фрагментов")


def answer_question(question: str, top_k: int | None = None) -> AskResponse:
    chunks = retrieve(question, top_k)
    if not chunks:
        return AskResponse(answer=NOT_FOUND, found=False, sources=[])

    context = "\n\n".join(f"[{i}] источник: {c.source}\n{c.text}" for i, c in enumerate(chunks, 1))
    result = get_llm().chat_json(
        load_prompt("rag_answer", context=context, question=question),
        RagAnswer,
        system=load_prompt("system"),
    )
    if not result.found:
        return AskResponse(answer=result.answer or NOT_FOUND, found=False, sources=[])

    cited = [chunks[i - 1] for i in result.sources if 1 <= i <= len(chunks)]
    # модель ответила, но номера не указала — показываем самый релевантный фрагмент
    return AskResponse(answer=result.answer, found=True, sources=cited or chunks[:1])
