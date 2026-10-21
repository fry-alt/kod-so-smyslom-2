import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.api.telegram_auth import telegram_user
from app.db import get_session
from app.llm.client import get_llm
from app.llm.providers import LLMError
from app.models import Interaction
from app.schemas import ChatRequest, ChatResponse, TelegramUser
from app.services import assistant

router = APIRouter(prefix="/chat", tags=["chat"])


def _user_id(req: ChatRequest, tg_user: TelegramUser | None) -> str | None:
    return f"tg:{tg_user.id}" if tg_user else req.user_id


@router.post("", response_model=ChatResponse)
def chat(
    req: ChatRequest,
    session: Session = Depends(get_session),
    tg_user: TelegramUser | None = Depends(telegram_user),
) -> ChatResponse:
    """Помощник «Спросить о фонде»: отвечает по документам фонда и показывает, откуда ответ."""
    result = assistant.reply(req.message, req.history)
    session.add(
        Interaction(
            channel=req.channel,
            user_id=_user_id(req, tg_user),
            question=req.message,
            answer=result.answer,
        )
    )
    session.commit()
    llm = get_llm()
    return ChatResponse(
        answer=result.answer,
        sources=result.sources,
        provider=llm.provider.name,
        model=llm.provider.model,
    )


@router.post("/stream")
def chat_stream(
    req: ChatRequest, tg_user: TelegramUser | None = Depends(telegram_user)
) -> StreamingResponse:
    """Server-Sent Events: строки `data: {"delta": "..."}`, в конце `data: [DONE]`.
    Ответ приходит одним куском: прежде чем показать, его проверяет защита помощника."""

    def events() -> Iterator[str]:
        try:
            answer = assistant.reply(req.message, req.history).answer
            yield f"data: {json.dumps({'delta': answer}, ensure_ascii=False)}\n\n"
        except LLMError as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")
