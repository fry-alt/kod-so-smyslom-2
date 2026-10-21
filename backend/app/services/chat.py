"""Переписка фонда с волонтёром (T-100), как на hh.ru: координатор видит отклик или кандидата
и пишет ему, волонтёр отвечает из личного кабинета.

Упрощённый чат из Yapp (server/messages.js): одна переписка на волонтёра, со стороны фонда пишет
любой координатор. «Прочитано» — id последнего увиденного сообщения у каждой стороны.
Доставка — сайт сам спрашивает новые сообщения раз в несколько секунд, без WebSocket.

Текст переписки — персональные данные: в LLM и в векторный индекс не уходит, в логах его нет.
"""

import re
from datetime import UTC, datetime

from sqlmodel import Session, col, func, select

from app.models import Dialog, DialogMessage, Opportunity, Volunteer
from app.schemas import DialogOut, DialogSummary, Message, MessageIn, Sender, VolunteerRef
from app.services import notify

PAGE = 200  # столько последних сообщений отдаём в переписке

# Волонтёру в Telegram — без текста сообщения: только что ему написали.
NOTIFY_TEXT = (
    "Координатор фонда «Дети Марии» написал вам сообщение.\n"
    "Откройте личный кабинет на сайте фонда — раздел «Сообщения»."
)


class ChatError(ValueError):
    """Сообщение нельзя отправить — текст ошибки показываем человеку."""


def clean_text(text: str) -> str:
    """Переводы строк сохраняем (не больше двух подряд), управляющие и «невидимые» символы убираем."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\x00-\x08\x0b-\x1f\x7f​-‏ -‮⁦-⁩]", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _dialog(session: Session, volunteer_id: int) -> Dialog | None:
    return session.exec(select(Dialog).where(Dialog.volunteer_id == volunteer_id)).first()


def _read_id(dialog: Dialog, reader: Sender) -> int:
    return dialog.volunteer_read_id if reader == "volunteer" else dialog.fund_read_id


def _unread(session: Session, dialog: Dialog, reader: Sender) -> int:
    """Сколько сообщений от собеседника этот человек ещё не видел."""
    return session.exec(
        select(func.count())
        .select_from(DialogMessage)
        .where(
            DialogMessage.dialog_id == dialog.id,
            DialogMessage.sender != reader,
            DialogMessage.id > _read_id(dialog, reader),
        )
    ).one()


def _message_out(session: Session, m: DialogMessage) -> Message:
    opportunity = session.get(Opportunity, m.opportunity_id) if m.opportunity_id else None
    return Message(
        id=m.id,
        sender=m.sender,
        text=m.text,
        opportunity_id=m.opportunity_id,
        opportunity_title=opportunity.title if opportunity else None,
        created_at=m.created_at,
    )


def _ref(volunteer: Volunteer) -> VolunteerRef:
    return VolunteerRef(id=volunteer.id, name=volunteer.name)


def dialog(session: Session, volunteer: Volunteer, reader: Sender) -> DialogOut:
    """Переписка с волонтёром. Если ещё не писали — пустая (в базе не создаём)."""
    d = _dialog(session, volunteer.id)
    if d is None:
        return DialogOut(volunteer=_ref(volunteer), messages=[], unread=0, their_read_id=0)
    rows = session.exec(
        select(DialogMessage)
        .where(DialogMessage.dialog_id == d.id)
        .order_by(col(DialogMessage.id).desc())
        .limit(PAGE)
    ).all()
    other: Sender = "coordinator" if reader == "volunteer" else "volunteer"
    return DialogOut(
        volunteer=_ref(volunteer),
        messages=[_message_out(session, m) for m in reversed(rows)],
        unread=_unread(session, d, reader),
        their_read_id=_read_id(d, other),
    )


def send(session: Session, volunteer: Volunteer, data: MessageIn) -> Message:
    text = clean_text(data.text)
    if not text:
        raise ChatError("Пустое сообщение")
    if data.opportunity_id is not None and session.get(Opportunity, data.opportunity_id) is None:
        raise ChatError("Такого занятия нет — возможно, его удалили")
    d = _dialog(session, volunteer.id) or Dialog(volunteer_id=volunteer.id)
    session.add(d)
    session.flush()  # нужен d.id
    # Уведомляем одним сообщением на «пачку»: только если до этого всё было прочитано.
    first_unread = data.sender == "coordinator" and _unread(session, d, "volunteer") == 0
    message = DialogMessage(
        dialog_id=d.id, sender=data.sender, text=text, opportunity_id=data.opportunity_id
    )
    session.add(message)
    session.flush()
    d.last_at = datetime.now(UTC)
    # своё сообщение — прочитано
    if data.sender == "volunteer":
        d.volunteer_read_id = message.id
    else:
        d.fund_read_id = message.id
    session.add(d)
    session.commit()
    session.refresh(message)
    if first_unread:
        notify.send(volunteer, NOTIFY_TEXT, "сообщение от координатора")
    return _message_out(session, message)


def mark_read(session: Session, volunteer: Volunteer, reader: Sender) -> int:
    """Отметить всё в переписке прочитанным. Вернёт, сколько непрочитанных осталось у этого человека
    (у волонтёра — 0, у фонда — во всех переписках, для значка в меню)."""
    d = _dialog(session, volunteer.id)
    if d is not None:
        last = session.exec(
            select(func.max(DialogMessage.id)).where(DialogMessage.dialog_id == d.id)
        ).one()
        if reader == "volunteer":
            d.volunteer_read_id = last or 0
        else:
            d.fund_read_id = last or 0
        session.add(d)
        session.commit()
    if reader == "volunteer":
        return 0
    return sum(s.unread for s in dialogs(session))


def dialogs(session: Session) -> list[DialogSummary]:
    """Все переписки фонда, свежие сверху, — для координатора."""
    out = []
    for d in session.exec(select(Dialog).order_by(col(Dialog.last_at).desc())).all():
        volunteer = session.get(Volunteer, d.volunteer_id)
        if volunteer is None:
            continue
        last = session.exec(
            select(DialogMessage)
            .where(DialogMessage.dialog_id == d.id)
            .order_by(col(DialogMessage.id).desc())
        ).first()
        out.append(
            DialogSummary(
                volunteer=_ref(volunteer),
                last=_message_out(session, last) if last else None,
                unread=_unread(session, d, "coordinator"),
            )
        )
    return out
