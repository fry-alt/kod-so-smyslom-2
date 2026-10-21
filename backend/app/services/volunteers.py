"""Волонтёры: анкета, статусы, часы, заметки координатора.

Пока без LLM: profile=None. Извлечение профиля и векторный индекс — T-05.
"""

from sqlalchemy import func
from sqlmodel import Session, col, select

from app.models import Note, QuizAttempt, Volunteer
from app.schemas import Note as NoteOut
from app.schemas import (
    NoteIn,
    VolunteerIn,
    VolunteerOut,
    VolunteerStatus,
    VolunteerUpdate,
)


def create(session: Session, data: VolunteerIn) -> Volunteer:
    volunteer = Volunteer(
        name=data.name,
        contact=data.contact,
        telegram_id=data.telegram_id,
        answers=data.answers.model_dump(),
    )
    session.add(volunteer)
    session.commit()
    session.refresh(volunteer)
    return volunteer


def get(session: Session, volunteer_id: int) -> Volunteer | None:
    return session.get(Volunteer, volunteer_id)


def list_all(session: Session, status: VolunteerStatus | None = None) -> list[Volunteer]:
    query = select(Volunteer).order_by(col(Volunteer.id).desc())  # новые сверху
    if status:
        query = query.where(Volunteer.status == status)
    return list(session.exec(query).all())


def update(session: Session, volunteer: Volunteer, data: VolunteerUpdate) -> Volunteer:
    """Меняет только переданные поля."""
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(volunteer, field, value)
    session.add(volunteer)
    session.commit()
    session.refresh(volunteer)
    return volunteer


def add_note(session: Session, volunteer: Volunteer, data: NoteIn) -> NoteOut:
    note = Note(volunteer_id=volunteer.id, text=data.text, author=data.author)
    session.add(note)
    session.commit()
    session.refresh(note)
    return NoteOut.model_validate(note, from_attributes=True)


def list_notes(session: Session, volunteer: Volunteer) -> list[NoteOut]:
    query = select(Note).where(Note.volunteer_id == volunteer.id).order_by(col(Note.id))
    return [NoteOut.model_validate(n, from_attributes=True) for n in session.exec(query)]


def training_score(session: Session, volunteer_id: int) -> int | None:
    """Средний % по тестам: берём лучшую попытку по каждому модулю. None — не проходил."""
    best = (
        select(func.max(QuizAttempt.score))
        .where(QuizAttempt.volunteer_id == volunteer_id)
        .group_by(QuizAttempt.module_id)
    )
    scores = list(session.exec(best).all())
    if not scores:
        return None
    return round(sum(scores) / len(scores))


def to_out(session: Session, volunteer: Volunteer) -> VolunteerOut:
    return VolunteerOut(
        id=volunteer.id,
        name=volunteer.name,
        contact=volunteer.contact,
        telegram_id=volunteer.telegram_id,
        answers=volunteer.answers,
        profile=volunteer.profile,
        status=volunteer.status,
        training_score=training_score(session, volunteer.id),
        hours=volunteer.hours,
        created_at=volunteer.created_at,
    )
