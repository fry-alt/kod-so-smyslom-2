from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.models import Opportunity, Volunteer
from app.models import Participation as ParticipationRow
from app.schemas import (
    InviteIn,
    OpportunityIn,
    OpportunityOut,
    Participation,
    ParticipationUpdate,
    RespondIn,
)
from app.services import opportunities, volunteers

router = APIRouter(tags=["opportunities"])


def _opportunity_or_404(session: Session, opportunity_id: int) -> Opportunity:
    opportunity = opportunities.get(session, opportunity_id)
    if opportunity is None:
        raise HTTPException(404, f"Возможность {opportunity_id} не найдена")
    return opportunity


def _volunteer_or_404(session: Session, volunteer_id: int) -> Volunteer:
    volunteer = volunteers.get(session, volunteer_id)
    if volunteer is None:
        raise HTTPException(404, f"Волонтёр {volunteer_id} не найден")
    return volunteer


def _participation_or_404(session: Session, participation_id: int) -> ParticipationRow:
    participation = opportunities.get_participation(session, participation_id)
    if participation is None:
        raise HTTPException(404, f"Участие {participation_id} не найдено")
    return participation


@router.post("/opportunities", response_model=OpportunityOut)
def create(data: OpportunityIn, session: Session = Depends(get_session)) -> OpportunityOut:
    """Координатор создаёт задачу или мероприятие."""
    return opportunities.to_out(session, opportunities.create(session, data))


@router.get("/opportunities", response_model=list[OpportunityOut])
def list_all(
    volunteer_id: int | None = None, session: Session = Depends(get_session)
) -> list[OpportunityOut]:
    """Каталог. С volunteer_id — флаг «подходит вам» и статус участия этого волонтёра."""
    volunteer = _volunteer_or_404(session, volunteer_id) if volunteer_id is not None else None
    return [opportunities.to_out(session, o, volunteer) for o in opportunities.list_all(session)]


@router.get("/opportunities/{opportunity_id}", response_model=OpportunityOut)
def get(opportunity_id: int, session: Session = Depends(get_session)) -> OpportunityOut:
    return opportunities.to_out(session, _opportunity_or_404(session, opportunity_id))


@router.post("/opportunities/{opportunity_id}/respond", response_model=Participation)
def respond(
    opportunity_id: int, data: RespondIn, session: Session = Depends(get_session)
) -> Participation:
    """Волонтёр откликается."""
    opportunity = _opportunity_or_404(session, opportunity_id)
    volunteer = _volunteer_or_404(session, data.volunteer_id)
    participation = opportunities.respond(session, opportunity, volunteer)
    return opportunities.participation_out(session, participation)


@router.post("/opportunities/{opportunity_id}/invite", response_model=list[Participation])
def invite(
    opportunity_id: int, data: InviteIn, session: Session = Depends(get_session)
) -> list[Participation]:
    """Координатор приглашает волонтёров, найденных поиском."""
    opportunity = _opportunity_or_404(session, opportunity_id)
    invited = [_volunteer_or_404(session, v) for v in dict.fromkeys(data.volunteer_ids)]
    return [
        opportunities.participation_out(session, p)
        for p in opportunities.invite(session, opportunity, invited)
    ]


@router.get("/opportunities/{opportunity_id}/participants", response_model=list[Participation])
def participants(
    opportunity_id: int, session: Session = Depends(get_session)
) -> list[Participation]:
    return opportunities.participants(session, _opportunity_or_404(session, opportunity_id))


@router.get("/volunteers/{volunteer_id}/participations", response_model=list[Participation])
def volunteer_history(
    volunteer_id: int, session: Session = Depends(get_session)
) -> list[Participation]:
    """История участия волонтёра — для него самого и для карточки в /admin."""
    return opportunities.volunteer_history(session, _volunteer_or_404(session, volunteer_id))


@router.patch("/participations/{participation_id}", response_model=Participation)
def update(
    participation_id: int, data: ParticipationUpdate, session: Session = Depends(get_session)
) -> Participation:
    """confirmed — подтвердить, attended — участвовал (часы волонтёру), declined — отказ."""
    participation = _participation_or_404(session, participation_id)
    try:
        participation = opportunities.update_status(session, participation, data.status)
    except opportunities.ParticipationError as e:
        raise HTTPException(409, str(e)) from e
    return opportunities.participation_out(session, participation)
