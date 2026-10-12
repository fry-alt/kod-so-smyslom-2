"""ЗАГЛУШКА под логику кейса. Сюда пишем в день хакатона.

Как превратить в рабочий сценарий за 15 минут:
1. Заполнить docs/CASE.md и прогнать /case-kickoff в Claude Code.
2. Поменять CaseInput / CaseResult под контракт кейса.
3. Переписать промпт backend/app/llm/prompts/case.md (оставить few-shot пример!).
4. Если нужны данные НКО — достать их через app.rag.retrieve.retrieve() и подставить в промпт.
Эндпоинт уже есть: POST /case/run (backend/app/api/case.py).
"""

from pydantic import BaseModel, Field

from app.llm.client import get_llm
from app.llm.prompts import load_prompt


class CaseInput(BaseModel):
    text: str = Field(min_length=1, max_length=8000, description="входные данные кейса")


class CaseResult(BaseModel):
    summary: str = Field(description="суть в одном предложении")
    category: str = Field(description="категория обращения")
    next_steps: list[str] = Field(description="что сделать сотруднику")


def run_case(data: CaseInput) -> CaseResult:
    # TODO(кейс): заменить на логику конкретного кейса
    return get_llm().chat_json(
        load_prompt("case", text=data.text), CaseResult, system=load_prompt("system")
    )
