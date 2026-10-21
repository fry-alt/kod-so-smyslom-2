from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.models import Volunteer
from app.schemas import Note, NoteIn, VolunteerIn, VolunteerOut, VolunteerStatus, VolunteerUpdate
from app.services import volunteers

router = APIRouter(prefix="/volunteers", tags=["volunteers"])


def _get_or_404(session: Session, volunteer_id: int) -> Volunteer:
    volunteer = volunteers.get(session, volunteer_id)
    if volunteer is None:
        raise HTTPException(404, f"Волонтёр {volunteer_id} не найден")
    return volunteer


@router.post("", response_model=VolunteerOut)
def create(data: VolunteerIn, session: Session = Depends(get_session)) -> VolunteerOut:
    """Анкета волонтёра."""
    return volunteers.to_out(session, volunteers.create(session, data))


@router.get("", response_model=list[VolunteerOut])
def list_all(
    status: VolunteerStatus | None = None, session: Session = Depends(get_session)
) -> list[VolunteerOut]:
    return [volunteers.to_out(session, v) for v in volunteers.list_all(session, status)]


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


@router.get("/{volunteer_id}/notes", response_model=list[Note])
def list_notes(volunteer_id: int, session: Session = Depends(get_session)) -> list[Note]:
    return volunteers.list_notes(session, _get_or_404(session, volunteer_id))


@router.post("/{volunteer_id}/notes", response_model=Note)
def add_note(volunteer_id: int, data: NoteIn, session: Session = Depends(get_session)) -> Note:
    return volunteers.add_note(session, _get_or_404(session, volunteer_id), data)
