"""Волонтёры: анкета → профиль (LLM) → векторный индекс; статусы, часы, заметки координатора.

В LLM и в индекс уходят только ответы анкеты и теги профиля (answers_text, index_document).
Имя, контакт, telegram_id и заметки остаются в БД.
"""

import logging
from typing import Any

from sqlalchemy import func
from sqlmodel import Session, col, select

from app.llm.client import get_llm
from app.llm.prompts import load_prompt
from app.llm.providers import LLMError
from app.models import Note, QuizAttempt, Volunteer
from app.schemas import (
    Answers,
    NoteIn,
    Profile,
    VolunteerIn,
    VolunteerOut,
    VolunteerStatus,
    VolunteerUpdate,
)
from app.schemas import Note as NoteOut
from app.services import notify, volunteer_index
from app.services.roles import load_roles

log = logging.getLogger(__name__)

# Коды из анкеты → слова, понятные модели (и людям в логах).
AVAILABILITY = {
    "weekday_morning": "будни утром",
    "weekday_day": "будни днём",
    "weekday_evening": "будни вечером",
    "weekend": "выходные",
}
OCCUPATION = {
    "student": "студент",
    "pensioner": "пенсионер",
    "remote": "удалённая работа",
    "employed": "работает",
    "schoolkid": "школьник",
    "other": "другое",
}
REGION = {
    "moscow": "Москва",
    "moscow_region": "Московская область",
    "yaroslavl": "Ярославская область",
    "north_ossetia": "Северная Осетия",
    "other": "другой регион",
}
FORMAT = {"offline": "очно", "online": "онлайн"}
REGULARITY = {"regular": "постоянно", "episodic": "разово", "any": "неважно"}


def create(session: Session, data: VolunteerIn, telegram_id: int | None = None) -> Volunteer:
    """Сначала сохраняем анкету — она не должна потеряться, даже если LLM недоступна.
    telegram_id — только проверенный (из подписи Mini App), а не тот, что прислали в анкете."""
    volunteer = Volunteer(
        name=data.name,
        contact=data.contact,
        telegram_id=telegram_id,
        answers=data.answers.model_dump(),
    )
    session.add(volunteer)
    session.commit()

    profile = extract_profile(data.answers)
    if profile:
        volunteer.profile = profile.model_dump()
        session.add(volunteer)
        session.commit()
    session.refresh(volunteer)

    try:
        volunteer_index.upsert(volunteer.id, index_document(volunteer), index_metadata(volunteer))
    except LLMError as e:
        log.warning("Волонтёр %s не попал в индекс: %s", volunteer.id, e)
    return volunteer


def extract_profile(answers: Answers) -> Profile | None:
    """LLM строит профиль по ответам анкеты. None — модель недоступна или ответила мусором."""
    roles = load_roles()
    prompt = load_prompt(
        "profile",
        roles="\n".join(f"{r.code}: {r.title}" for r in roles) or "(справочник ролей пока пуст)",
        answers=answers_text(answers),
    )
    try:
        profile = get_llm().chat_json(prompt, Profile, system=load_prompt("system"))
    except LLMError as e:
        log.warning("Профиль не построен, анкета сохранена без него: %s", e)
        return None
    known = {r.code for r in roles}
    profile.suitable_roles = [code for code in profile.suitable_roles if code in known]
    return profile


def answers_text(answers: Answers) -> str:
    """Ответы анкеты текстом — для промпта и для индекса. Персональных данных здесь нет."""
    lines = [
        ("О себе", answers.about),
        ("Умеет", answers.skills),
        ("Хочет", answers.wishes),
        ("Опыт", answers.experience),
        ("Когда свободен", ", ".join(AVAILABILITY[a] for a in answers.availability)),
        ("Занятость", OCCUPATION[answers.occupation]),
        ("Регион", REGION[answers.region]),
        ("Формат", ", ".join(FORMAT[f] for f in answers.formats)),
        ("Регулярность", REGULARITY[answers.regularity]),
    ]
    return "\n".join(f"{label}: {value}" for label, value in lines if value)


def index_document(volunteer: Volunteer) -> str:
    text = answers_text(Answers.model_validate(volunteer.answers))
    if volunteer.profile:
        p = Profile.model_validate(volunteer.profile)
        text += (
            f"\nНавыки: {', '.join(p.skills)}\nИнтересы: {', '.join(p.interests)}"
            f"\nРоли: {', '.join(p.suitable_roles)}\nКратко: {p.summary}"
        )
    return text


def index_metadata(volunteer: Volunteer) -> dict[str, Any]:
    """Поля для жёсткого фильтра в поиске. Пустые списки Chroma не принимает — пропускаем."""
    answers = volunteer.answers
    metadata: dict[str, Any] = {
        "status": volunteer.status,
        "occupation": answers["occupation"],
        "region": answers["region"],
        "regularity": answers["regularity"],
    }
    for key in ("availability", "formats"):
        if answers[key]:
            metadata[key] = answers[key]
    return metadata


def get(session: Session, volunteer_id: int) -> Volunteer | None:
    return session.get(Volunteer, volunteer_id)


def by_telegram(session: Session, telegram_id: int) -> Volunteer | None:
    """Анкета человека из Telegram Mini App; если заполнял несколько раз — последняя."""
    query = select(Volunteer).where(Volunteer.telegram_id == telegram_id)
    return session.exec(query.order_by(col(Volunteer.id).desc())).first()


def list_all(session: Session, status: VolunteerStatus | None = None) -> list[Volunteer]:
    query = select(Volunteer).order_by(col(Volunteer.id).desc())  # новые сверху
    if status:
        query = query.where(Volunteer.status == status)
    return list(session.exec(query).all())


def update(session: Session, volunteer: Volunteer, data: VolunteerUpdate) -> Volunteer:
    """Меняет только переданные поля. Допустили — пишем волонтёру в Telegram."""
    old_status = volunteer.status
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(volunteer, field, value)
    session.add(volunteer)
    session.commit()
    session.refresh(volunteer)
    volunteer_index.update_metadata(volunteer.id, index_metadata(volunteer))
    notify.status_changed(volunteer, old_status)
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
