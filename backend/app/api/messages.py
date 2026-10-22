"""Переписка фонда с волонтёром (T-100). Логика — services/chat.py.

Список переписок — только координатору. Переписку с волонтёром видит он сам и координатор,
и каждый пишет только от своего имени (check_owner и _own_side).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.api.auth import Viewer, check_owner, coordinator, viewer
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


def _own_side(session: Session, volunteer_id: int, who: Viewer, side: Sender) -> Volunteer:
    """Волонтёр — только в своей переписке и от своего имени, координатор — от имени фонда.
    Бот и скрипты со служебным ключом — за любую сторону."""
    volunteer = _volunteer_or_404(session, volunteer_id)
    check_owner(who, volunteer)
    if not who.service and side != ("coordinator" if who.is_coordinator else "volunteer"):
        raise HTTPException(403, "Писать и читать переписку можно только от своего имени")
    return volunteer


@router.get("/dialogs", response_model=list[DialogSummary], dependencies=[Depends(coordinator)])
def list_dialogs(session: Session = Depends(get_session)) -> list[DialogSummary]:
    """Все переписки фонда для координатора: свежие сверху, с числом новых сообщений."""
    return chat.dialogs(session)


@router.get("/volunteers/{volunteer_id}/dialog", response_model=DialogOut)
def get_dialog(
    volunteer_id: int,
    reader: Sender,
    session: Session = Depends(get_session),
    who: Viewer = Depends(viewer),
) -> DialogOut:
    """Переписка с волонтёром. reader — кто смотрит: от этого зависит, что считается новым."""
    return chat.dialog(session, _own_side(session, volunteer_id, who, reader), reader)


@router.post("/volunteers/{volunteer_id}/dialog/messages", response_model=Message)
def send(
    volunteer_id: int,
    data: MessageIn,
    session: Session = Depends(get_session),
    who: Viewer = Depends(viewer),
) -> Message:
    """Написать: координатор — волонтёру (уйдёт уведомление в Telegram без текста) или волонтёр — фонду."""
    volunteer = _own_side(session, volunteer_id, who, data.sender)
    try:
        return chat.send(session, volunteer, data)
    except chat.ChatError as e:
        raise HTTPException(422, str(e)) from e


@router.post("/volunteers/{volunteer_id}/dialog/read", response_model=UnreadOut)
def mark_read(
    volunteer_id: int,
    data: ReadIn,
    session: Session = Depends(get_session),
    who: Viewer = Depends(viewer),
) -> UnreadOut:
    """Отметить переписку прочитанной; в ответе — сколько непрочитанных осталось."""
    volunteer = _own_side(session, volunteer_id, who, data.reader)
    return UnreadOut(unread=chat.mark_read(session, volunteer, data.reader))
