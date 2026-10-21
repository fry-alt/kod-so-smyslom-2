from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.models import Interview as InterviewRow
from app.models import Volunteer
from app.schemas import Interview, InterviewIn, InterviewUpdate
from app.services import interviews, volunteers

router = APIRouter(tags=["interviews"])


def _volunteer_or_404(session: Session, volunteer_id: int) -> Volunteer:
    volunteer = volunteers.get(session, volunteer_id)
    if volunteer is None:
        raise HTTPException(404, f"Волонтёр {volunteer_id} не найден")
    return volunteer


def _interview_or_404(session: Session, interview_id: int) -> InterviewRow:
    interview = interviews.get(session, interview_id)
    if interview is None:
        raise HTTPException(404, f"Собеседование {interview_id} не найдено")
    return interview


@router.post("/volunteers/{volunteer_id}/interviews", response_model=Interview)
def create(
    volunteer_id: int, data: InterviewIn, session: Session = Depends(get_session)
) -> InterviewRow:
    """Координатор назначает видеособеседование; волонтёру уходит ссылка в Telegram."""
    volunteer = _volunteer_or_404(session, volunteer_id)
    return interviews.create(session, volunteer, data.starts_at)


@router.get("/volunteers/{volunteer_id}/interviews", response_model=list[Interview])
def list_for_volunteer(
    volunteer_id: int, session: Session = Depends(get_session)
) -> list[InterviewRow]:
    """Собеседования волонтёра — для карточки в /admin и для раздела «Я»."""
    return interviews.for_volunteer(session, _volunteer_or_404(session, volunteer_id))


@router.patch("/interviews/{interview_id}", response_model=Interview)
def update(
    interview_id: int, data: InterviewUpdate, session: Session = Depends(get_session)
) -> InterviewRow:
    """done — прошло, canceled — отменить (ссылка перестаёт работать)."""
    return interviews.update_status(session, _interview_or_404(session, interview_id), data.status)
