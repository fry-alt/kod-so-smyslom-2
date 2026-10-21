"""Каталог возможностей и учёт участия: отклики, приглашения, подтверждение, часы.

Путь участия: responded (откликнулся) или invited (пригласили) → confirmed → attended (часы += hours)
или declined. LLM здесь не нужен: «подходит вам» считаем по анкете, профилю и роли.
"""

from datetime import datetime

from sqlmodel import Session, col, select

from app.models import Opportunity, Participation, Volunteer
from app.schemas import (
    Answers,
    Availability,
    OpportunityIn,
    OpportunityOut,
    ParticipationStatus,
    Profile,
)
from app.schemas import Participation as ParticipationOut
from app.services.roles import load_roles

# Координатор меняет участие только на эти статусы; responded и invited ставят отклик и приглашение.
COORDINATOR_STATUSES = ("confirmed", "attended", "declined")


class ParticipationError(ValueError):
    """Действие с участием нельзя выполнить — текст ошибки показываем координатору."""


def create(session: Session, data: OpportunityIn) -> Opportunity:
    # часовой пояс отбрасываем: храним местное время, как его написал координатор
    opportunity = Opportunity(
        **{**data.model_dump(), "starts_at": data.starts_at.replace(tzinfo=None)}
    )
    session.add(opportunity)
    session.commit()
    session.refresh(opportunity)
    return opportunity


def get(session: Session, opportunity_id: int) -> Opportunity | None:
    return session.get(Opportunity, opportunity_id)


def list_all(session: Session) -> list[Opportunity]:
    """Ближайшие сверху."""
    return list(session.exec(select(Opportunity).order_by(col(Opportunity.starts_at))).all())


def time_slot(starts_at: datetime) -> Availability:
    """В какую графу анкеты «когда свободен» попадает начало возможности."""
    if starts_at.weekday() >= 5:
        return "weekend"
    if starts_at.hour < 12:
        return "weekday_morning"
    if starts_at.hour < 17:
        return "weekday_day"
    return "weekday_evening"


def is_recommended(opportunity: Opportunity, volunteer: Volunteer) -> bool:
    """«Подходит вам»: формат, регион и время совпадают с анкетой, а роль — с профилем или навыками."""
    answers = Answers.model_validate(volunteer.answers)
    if opportunity.format not in answers.formats:
        return False
    if opportunity.format == "offline" and opportunity.region != answers.region:
        return False  # онлайн-задачам регион неважен
    # если волонтёр не отметил, когда свободен, по времени не отсекаем
    if answers.availability and time_slot(opportunity.starts_at) not in answers.availability:
        return False
    if not opportunity.role_code:
        return True
    return role_matches(opportunity.role_code, volunteer)


def role_matches(role_code: str, volunteer: Volunteer) -> bool:
    """Роль в подходящих по профилю или навык роли встречается в профиле и ответах анкеты."""
    profile = Profile.model_validate(volunteer.profile) if volunteer.profile else None
    if profile and role_code in profile.suitable_roles:
        return True
    role = next((r for r in load_roles() if r.code == role_code), None)
    if role is None:
        return False
    answers = Answers.model_validate(volunteer.answers)
    text = " ".join([answers.about, answers.skills, answers.wishes, answers.experience])
    if profile:
        text += " " + " ".join(profile.skills + profile.interests)
    text = text.lower()
    return any(skill.lower() in text for skill in role.skills)


def to_out(
    session: Session, opportunity: Opportunity, volunteer: Volunteer | None = None
) -> OpportunityOut:
    participations = _participations(session, opportunity_id=opportunity.id)
    taken = sum(p.status in ("confirmed", "attended") for p in participations)
    my_status = None
    if volunteer:
        my_status = next((p.status for p in participations if p.volunteer_id == volunteer.id), None)
    return OpportunityOut(
        **opportunity.model_dump(exclude={"created_at"}),
        taken=taken,
        recommended=bool(volunteer) and is_recommended(opportunity, volunteer),
        my_status=my_status,
    )


def respond(session: Session, opportunity: Opportunity, volunteer: Volunteer) -> Participation:
    """Волонтёр откликается. Повторный отклик не создаёт дубль, после отказа — откликается заново."""
    participation = _find(session, opportunity.id, volunteer.id)
    if participation is None:
        participation = Participation(opportunity_id=opportunity.id, volunteer_id=volunteer.id)
    elif participation.status == "declined":
        participation.status = "responded"
    else:
        return participation
    return _save(session, participation)


def invite(
    session: Session, opportunity: Opportunity, volunteers: list[Volunteer]
) -> list[Participation]:
    """Координатор приглашает найденных. Кто уже откликнулся или участвует — остаётся как был."""
    result = []
    for volunteer in volunteers:
        participation = _find(session, opportunity.id, volunteer.id)
        if participation is None:
            participation = Participation(
                opportunity_id=opportunity.id, volunteer_id=volunteer.id, status="invited"
            )
        elif participation.status == "declined":
            participation.status = "invited"
        else:
            result.append(participation)
            continue
        result.append(_save(session, participation))
    return result


def update_status(
    session: Session, participation: Participation, status: ParticipationStatus
) -> Participation:
    """Подтвердить, отметить участие (начисляет часы волонтёру) или отказать."""
    if status not in COORDINATOR_STATUSES:
        raise ParticipationError(f"Статус можно сменить на {', '.join(COORDINATOR_STATUSES)}")
    opportunity = session.get(Opportunity, participation.opportunity_id)
    volunteer = session.get(Volunteer, participation.volunteer_id)
    was_taken = participation.status in ("confirmed", "attended")
    if status in ("confirmed", "attended") and not was_taken:
        taken = sum(
            p.status in ("confirmed", "attended")
            for p in _participations(session, opportunity_id=opportunity.id)
        )
        if taken >= opportunity.slots:
            raise ParticipationError(f"Все места заняты: {taken} из {opportunity.slots}")

    if status == "attended" and participation.status != "attended":
        participation.hours = opportunity.hours
        volunteer.hours += opportunity.hours
    elif status != "attended" and participation.status == "attended":
        volunteer.hours = max(0, volunteer.hours - participation.hours)  # исправили ошибку
        participation.hours = 0
    participation.status = status
    session.add(volunteer)
    return _save(session, participation)


def get_participation(session: Session, participation_id: int) -> Participation | None:
    return session.get(Participation, participation_id)


def participants(session: Session, opportunity: Opportunity) -> list[ParticipationOut]:
    return [
        participation_out(session, p)
        for p in _participations(session, opportunity_id=opportunity.id)
    ]


def volunteer_history(session: Session, volunteer: Volunteer) -> list[ParticipationOut]:
    return [
        participation_out(session, p) for p in _participations(session, volunteer_id=volunteer.id)
    ]


def participation_out(session: Session, participation: Participation) -> ParticipationOut:
    return ParticipationOut(
        id=participation.id,
        opportunity_id=participation.opportunity_id,
        opportunity_title=session.get(Opportunity, participation.opportunity_id).title,
        volunteer_id=participation.volunteer_id,
        volunteer_name=session.get(Volunteer, participation.volunteer_id).name,
        status=participation.status,
        hours=participation.hours,
        created_at=participation.created_at,
    )


def _find(session: Session, opportunity_id: int, volunteer_id: int) -> Participation | None:
    query = select(Participation).where(
        Participation.opportunity_id == opportunity_id,
        Participation.volunteer_id == volunteer_id,
    )
    return session.exec(query).first()


def _participations(
    session: Session, opportunity_id: int | None = None, volunteer_id: int | None = None
) -> list[Participation]:
    query = select(Participation).order_by(col(Participation.id))
    if opportunity_id is not None:
        query = query.where(Participation.opportunity_id == opportunity_id)
    if volunteer_id is not None:
        query = query.where(Participation.volunteer_id == volunteer_id)
    return list(session.exec(query).all())


def _save(session: Session, participation: Participation) -> Participation:
    session.add(participation)
    session.commit()
    session.refresh(participation)
    return participation
