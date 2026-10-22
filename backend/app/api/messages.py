"""Переписка фонда с волонтёром (T-100). Логика — services/chat.py.

Как и остальной API кабинета, права здесь не проверяются: /admin сайт показывает только координатору,
волонтёру — только его переписку.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.api.auth import coordinator
from app.db import get_session
from app.models import Volunteer
from app.schemas import DialogOut, DialogSummary, Message, MessageIn, ReadIn, Sender, UnreadOut
from app.services import chat, volunteers

router = APIRouter(tags=["messages"])


def _volunteer_or_404(session: Session, volunteer_id: int) -> Volunteer:
    volunteer = volunteers.get(session, volunteer_id)
    if volunteer is None:
        raise HTTPException(404, f"Волонтёр {volunteer_id} не найден")
    return volunteer


@router.get("/dialogs", response_model=list[DialogSummary], dependencies=[Depends(coordinator)])
def list_dialogs(session: Session = Depends(get_session)) -> list[DialogSummary]:
    """Все переписки фонда для координатора: свежие сверху, с числом новых сообщений."""
    return chat.dialogs(session)


@router.get("/volunteers/{volunteer_id}/dialog", response_model=DialogOut)
def get_dialog(
    volunteer_id: int, reader: Sender, session: Session = Depends(get_session)
) -> DialogOut:
    """Переписка с волонтёром. reader — кто смотрит: от этого зависит, что считается новым."""
    return chat.dialog(session, _volunteer_or_404(session, volunteer_id), reader)


@router.post("/volunteers/{volunteer_id}/dialog/messages", response_model=Message)
def send(volunteer_id: int, data: MessageIn, session: Session = Depends(get_session)) -> Message:
    """Написать: координатор — волонтёру (уйдёт уведомление в Telegram без текста) или волонтёр — фонду."""
    volunteer = _volunteer_or_404(session, volunteer_id)
    try:
        return chat.send(session, volunteer, data)
    except chat.ChatError as e:
        raise HTTPException(422, str(e)) from e


@router.post("/volunteers/{volunteer_id}/dialog/read", response_model=UnreadOut)
def mark_read(
    volunteer_id: int, data: ReadIn, session: Session = Depends(get_session)
) -> UnreadOut:
    """Отметить переписку прочитанной; в ответе — сколько непрочитанных осталось."""
    volunteer = _volunteer_or_404(session, volunteer_id)
    return UnreadOut(unread=chat.mark_read(session, volunteer, data.reader))
