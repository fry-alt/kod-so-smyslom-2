from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.api.auth import Viewer, check_owner, coordinator, viewer
from app.db import get_session
from app.models import Interview as InterviewRow
from app.models import Volunteer
from app.schemas import (
    Interview,
    InterviewBookIn,
    InterviewIn,
    InterviewPlan,
    InterviewResultIn,
    InterviewSlots,
    InterviewUpdate,
)
from app.services import interview_plan, interviews, volunteers
from app.services.roles import load_roles

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


@router.post(
    "/volunteers/{volunteer_id}/interviews",
    response_model=Interview,
    dependencies=[Depends(coordinator)],
)
def create(
    volunteer_id: int, data: InterviewIn, session: Session = Depends(get_session)
) -> Interview:
    """Координатор назначает видеособеседование; волонтёру уходит ссылка в Telegram."""
    volunteer = _volunteer_or_404(session, volunteer_id)
    return interviews.to_out(session, interviews.create(session, volunteer, data.starts_at))


@router.get("/interviews/slots", response_model=InterviewSlots)
def slots(session: Session = Depends(get_session)) -> InterviewSlots:
    """Свободное время для собеседования — волонтёр выбирает его на странице «Собеседование»."""
    return InterviewSlots(slots=interviews.free_slots(session), minutes=interviews.SLOT_MINUTES)


@router.post("/volunteers/{volunteer_id}/interviews/book", response_model=Interview)
def book(
    volunteer_id: int,
    data: InterviewBookIn,
    session: Session = Depends(get_session),
    who: Viewer = Depends(viewer),
) -> Interview:
    """Волонтёр сам записывается на свободное время; координатор увидит запись в «Сводке»."""
    volunteer = _volunteer_or_404(session, volunteer_id)
    check_owner(who, volunteer)
    try:
        return interviews.to_out(session, interviews.book(session, volunteer, data.starts_at))
    except interviews.BookingError as e:
        raise HTTPException(409, str(e)) from e


@router.get("/volunteers/{volunteer_id}/interviews", response_model=list[Interview])
def list_for_volunteer(
    volunteer_id: int, session: Session = Depends(get_session), who: Viewer = Depends(viewer)
) -> list[Interview]:
    """Собеседования волонтёра — для карточки в /admin и для раздела «Я»."""
    volunteer = _volunteer_or_404(session, volunteer_id)
    check_owner(who, volunteer)
    return [interviews.to_out(session, i) for i in interviews.for_volunteer(session, volunteer)]


@router.get(
    "/volunteers/{volunteer_id}/interview-plan",
    response_model=InterviewPlan,
    dependencies=[Depends(coordinator)],
)
def plan(
    volunteer_id: int, refresh: bool = False, session: Session = Depends(get_session)
) -> InterviewPlan:
    """Вопросы к собеседованию под анкету (в LLM — только ответы анкеты). refresh=true — заново."""
    volunteer = _volunteer_or_404(session, volunteer_id)
    return interview_plan.get_or_build(session, volunteer, refresh)


@router.patch("/interviews/{interview_id}", response_model=Interview)
def update(
    interview_id: int,
    data: InterviewUpdate,
    session: Session = Depends(get_session),
    who: Viewer = Depends(viewer),
) -> Interview:
    """done — прошло, canceled — отменить (ссылка перестаёт работать). Волонтёр может только отменить своё."""
    interview = _interview_or_404(session, interview_id)
    check_owner(who, _volunteer_or_404(session, interview.volunteer_id))
    if not who.is_coordinator and data.status != "canceled":
        raise HTTPException(403, "Отметить собеседование может только координатор фонда")
    return interviews.to_out(session, interviews.update_status(session, interview, data.status))


@router.put(
    "/interviews/{interview_id}/result",
    response_model=Interview,
    dependencies=[Depends(coordinator)],
)
def save_result(
    interview_id: int, data: InterviewResultIn, session: Session = Depends(get_session)
) -> Interview:
    """Итог после звонка: оценки, решение, подходящие роли. Ставит собеседованию «прошло»."""
    interview = _interview_or_404(session, interview_id)
    if interview.status == "canceled":
        raise HTTPException(409, "Собеседование отменено — итог не сохраняем")
    known = {r.code for r in load_roles()}
    unknown = [code for code in data.roles if code not in known]
    if unknown:
        raise HTTPException(422, f"Неизвестные роли: {', '.join(unknown)}")
    return interviews.to_out(session, interviews.save_result(session, interview, data))
