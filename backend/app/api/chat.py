import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.api.telegram_auth import telegram_user
from app.db import get_session
from app.llm.client import get_llm
from app.llm.prompts import load_prompt
from app.llm.providers import LLMError, Message
from app.models import Interaction
from app.schemas import ChatRequest, ChatResponse, TelegramUser

router = APIRouter(prefix="/chat", tags=["chat"])


def _messages(req: ChatRequest) -> list[Message]:
    history = [m.model_dump() for m in req.history[-20:]]  # не раздуваем контекст
    return [*history, {"role": "user", "content": req.message}]


def _user_id(req: ChatRequest, tg_user: TelegramUser | None) -> str | None:
    return f"tg:{tg_user.id}" if tg_user else req.user_id


@router.post("", response_model=ChatResponse)
def chat(
    req: ChatRequest,
    session: Session = Depends(get_session),
    tg_user: TelegramUser | None = Depends(telegram_user),
) -> ChatResponse:
    llm = get_llm()
    answer = llm.chat(_messages(req), system=load_prompt("system"))
    session.add(
        Interaction(
            channel=req.channel, user_id=_user_id(req, tg_user), question=req.message, answer=answer
        )
    )
    session.commit()
    return ChatResponse(answer=answer, provider=llm.provider.name, model=llm.provider.model)


@router.post("/stream")
def chat_stream(
    req: ChatRequest, tg_user: TelegramUser | None = Depends(telegram_user)
) -> StreamingResponse:
    """Server-Sent Events: строки `data: {"delta": "..."}`, в конце `data: [DONE]`."""
    llm = get_llm()

    def events() -> Iterator[str]:
        try:
            for delta in llm.stream(_messages(req), system=load_prompt("system")):
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
        except LLMError as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")
