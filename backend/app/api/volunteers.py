from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session

from app.api.auth import current_account
from app.api.telegram_auth import verified_telegram_id
from app.db import get_session
from app.models import Account, Volunteer
from app.schemas import (
    Note,
    NoteIn,
    Thanks,
    VolunteerIn,
    VolunteerOut,
    VolunteerStatus,
    VolunteerUpdate,
)
from app.services import accounts, hours, volunteers

router = APIRouter(prefix="/volunteers", tags=["volunteers"])


def _get_or_404(session: Session, volunteer_id: int) -> Volunteer:
    volunteer = volunteers.get(session, volunteer_id)
    if volunteer is None:
        raise HTTPException(404, f"Волонтёр {volunteer_id} не найден")
    return volunteer


@router.post("", response_model=VolunteerOut)
def create(
    data: VolunteerIn,
    session: Session = Depends(get_session),
    account: Account | None = Depends(current_account),
    telegram_id: int | None = Depends(verified_telegram_id),
) -> VolunteerOut:
    """Анкета волонтёра. Если человек вошёл на сайт — анкета привязывается к его аккаунту.
    telegram_id берём из подписи Mini App (X-Telegram-Init-Data), поле telegram_id в анкете не используется."""
    volunteer = volunteers.create(session, data, telegram_id)
    if account is not None and volunteer.id is not None:
        accounts.link_volunteer(session, account, volunteer.id)
    return volunteers.to_out(session, volunteer)


@router.get("/by-telegram", response_model=VolunteerOut)
def by_telegram(
    session: Session = Depends(get_session),
    telegram_id: int | None = Depends(verified_telegram_id),
) -> VolunteerOut:
    """Моя анкета в Telegram Mini App: по подписи Telegram, без входа по почте. Открыл бота
    на другом телефоне — кабинет на месте. 404 — анкету из этого Telegram ещё не заполняли."""
    if telegram_id is None:
        raise HTTPException(401, "Откройте приложение из Telegram-бота фонда")
    volunteer = volunteers.by_telegram(session, telegram_id)
    if volunteer is None:
        raise HTTPException(404, "Анкету из этого Telegram ещё не заполняли")
    return volunteers.to_out(session, volunteer)


@router.get("", response_model=list[VolunteerOut])
def list_all(
    status: VolunteerStatus | None = None, session: Session = Depends(get_session)
) -> list[VolunteerOut]:
    return [volunteers.to_out(session, v) for v in volunteers.list_all(session, status)]


@router.get("/export.csv", response_class=Response)
def export_csv(session: Session = Depends(get_session)) -> Response:
    """Часы волонтёров для «Добро.рф»: имя, контакт, часы, роли, статус. Открывается в Excel."""
    return Response(
        hours.export_csv(session),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="volunteer-hours.csv"'},
    )


@router.get("/{volunteer_id}", response_model=VolunteerOut)
def get(volunteer_id: int, session: Session = Depends(get_session)) -> VolunteerOut:
    return volunteers.to_out(session, _get_or_404(session, volunteer_id))


@router.patch("/{volunteer_id}", response_model=VolunteerOut)
def update(
    volunteer_id: int, data: VolunteerUpdate, session: Session = Depends(get_session)
) -> VolunteerOut:
    """Координатор меняет статус и часы."""
    volunteer = volunteers.update(session, _get_or_404(session, volunteer_id), data)
    return volunteers.to_out(session, volunteer)


@router.get("/{volunteer_id}/thanks", response_model=Thanks)
def thanks(volunteer_id: int, session: Session = Depends(get_session)) -> Thanks:
    """Благодарность от фонда за часы и роли — координатор копирует и отправляет сам."""
    return hours.thanks(session, _get_or_404(session, volunteer_id))


@router.get("/{volunteer_id}/notes", response_model=list[Note])
def list_notes(volunteer_id: int, session: Session = Depends(get_session)) -> list[Note]:
    return volunteers.list_notes(session, _get_or_404(session, volunteer_id))


@router.post("/{volunteer_id}/notes", response_model=Note)
def add_note(volunteer_id: int, data: NoteIn, session: Session = Depends(get_session)) -> Note:
    return volunteers.add_note(session, _get_or_404(session, volunteer_id), data)
