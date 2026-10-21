"""Видеособеседование координатора с волонтёром (T-59).

Координатор назначает время → у собеседования появляется случайный token, ссылка на звонок
/call/<token> уходит волонтёру в Telegram. Статусы волонтёра не меняются: после звонка
координатор отмечает «прошло», пишет заметку и сам решает, что дальше.

Волонтёр может и сам записаться на свободное время (free_slots → book): будни 10:00–18:00,
каждые полчаса, на две недели вперёд, кроме занятого другими собеседованиями.

Сам звонок — WebRTC между двумя браузерами, как в Yapp: бэкенд только знакомит их
(api/calls.py) и выдаёт адреса STUN/TURN (ice_servers).
"""

import base64
import hashlib
import hmac
import secrets
import time
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, col, select

from app.config import Settings, get_settings
from app.models import Interview, InterviewResult, Volunteer
from app.schemas import IceServer, InterviewResultIn, InterviewStatus
from app.schemas import Interview as InterviewOut
from app.schemas import InterviewResult as InterviewResultOut
from app.services import notify
from app.services.dashboard import local_now

# Запись на собеседование самим волонтёром
SLOT_MINUTES = 30
SLOT_DAYS = 14  # насколько вперёд показываем время
SLOT_HOURS = (10, 18)  # с 10:00, последнее начало — 17:30
SLOT_LEAD = timedelta(
    hours=2
)  # не ближе, чем через 2 часа: координатор должен успеть увидеть запись


class BookingError(ValueError):
    """Понятная человеку причина, почему записаться не получилось."""


TURN_TTL = 6 * 3600  # секунд действуют логин и пароль TURN — с запасом на долгий звонок

# fmt: off
MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня",
          "июля", "августа", "сентября", "октября", "ноября", "декабря"]
# fmt: on


def create(session: Session, volunteer: Volunteer, starts_at: datetime) -> Interview:
    # часовой пояс отбрасываем: храним местное время, как его написал координатор
    interview = Interview(
        volunteer_id=volunteer.id,
        starts_at=starts_at.replace(tzinfo=None),
        token=secrets.token_urlsafe(16),
    )
    session.add(interview)
    session.commit()
    # ссылку отправляем, когда комната уже сохранена
    interview.notified = notify.send(volunteer, invitation_text(interview), "собеседование")
    session.add(interview)
    session.commit()
    session.refresh(interview)
    return interview


def free_slots(session: Session, now: datetime | None = None) -> list[datetime]:
    """Свободное время для записи: будни, рабочие часы, без пересечений с назначенными собеседованиями."""
    now = now or local_now()
    busy = [
        i.starts_at
        for i in session.exec(select(Interview).where(Interview.status == "scheduled")).all()
    ]
    length = timedelta(minutes=SLOT_MINUTES)
    slots = []
    for day in range(SLOT_DAYS + 1):
        date = now.date() + timedelta(days=day)
        if date.weekday() >= 5:
            continue
        start = datetime(date.year, date.month, date.day, SLOT_HOURS[0])
        while start.hour < SLOT_HOURS[1]:
            # координатор мог назначить и не ровно по сетке — занятым считаем любое пересечение
            if start >= now + SLOT_LEAD and all(abs(start - b) >= length for b in busy):
                slots.append(start)
            start += length
    return slots


def upcoming(
    session: Session, volunteer: Volunteer, now: datetime | None = None
) -> Interview | None:
    """Ближайшее назначенное собеседование волонтёра (опоздавшего ещё ждём 2 часа)."""
    since = (now or local_now()) - timedelta(hours=2)
    query = (
        select(Interview)
        .where(Interview.volunteer_id == volunteer.id, Interview.status == "scheduled")
        .where(col(Interview.starts_at) >= since)
        .order_by(col(Interview.starts_at))
    )
    return session.exec(query).first()


def book(session: Session, volunteer: Volunteer, starts_at: datetime) -> Interview:
    """Волонтёр записывается сам. Одна запись за раз: чтобы перенести — сначала отменить."""
    if upcoming(session, volunteer):
        raise BookingError(
            "Вы уже записаны на собеседование. Чтобы выбрать другое время, отмените запись"
        )
    if starts_at.replace(tzinfo=None) not in free_slots(session):
        raise BookingError("Это время уже занято или прошло — выберите другое")
    return create(session, volunteer, starts_at)


def get(session: Session, interview_id: int) -> Interview | None:
    return session.get(Interview, interview_id)


def by_token(session: Session, token: str) -> Interview | None:
    return session.exec(select(Interview).where(Interview.token == token)).first()


def for_volunteer(session: Session, volunteer: Volunteer) -> list[Interview]:
    """Последнее назначенное — сверху."""
    query = (
        select(Interview)
        .where(Interview.volunteer_id == volunteer.id)
        .order_by(col(Interview.starts_at).desc())
    )
    return list(session.exec(query).all())


def update_status(session: Session, interview: Interview, status: InterviewStatus) -> Interview:
    interview.status = status
    session.add(interview)
    session.commit()
    session.refresh(interview)
    return interview


def save_result(session: Session, interview: Interview, data: InterviewResultIn) -> Interview:
    """Итог перезаписывается — координатор может поправить. Собеседование становится «прошло»,
    статус волонтёра не трогаем: что дальше, решает человек."""
    result = session.get(InterviewResult, interview.id)
    if result is None:
        result = InterviewResult(interview_id=interview.id, **data.model_dump())
    else:
        for field, value in data.model_dump().items():
            setattr(result, field, value)
        result.created_at = datetime.now(UTC)
    interview.status = "done"
    session.add(result)
    session.add(interview)
    session.commit()
    session.refresh(interview)
    return interview


def to_out(session: Session, interview: Interview) -> InterviewOut:
    """Собеседование для ответа API — вместе с итогом, если он есть."""
    result = session.get(InterviewResult, interview.id)
    return InterviewOut(
        **interview.model_dump(),
        result=InterviewResultOut.model_validate(result, from_attributes=True) if result else None,
    )


def call_link(token: str) -> str:
    """Полная ссылка на звонок, если известен адрес сайта, иначе путь."""
    return f"{get_settings().webapp_url.rstrip('/')}/call/{token}"


def invitation_text(interview: Interview) -> str:
    when = interview.starts_at
    return (
        "Координатор фонда «Дети Марии» приглашает вас на видеособеседование 📹\n"
        f"Когда: {when.day} {MONTHS[when.month - 1]} в {when:%H:%M}.\n"
        f"Ссылка на звонок: {call_link(interview.token)}\n"
        "Откройте её в назначенное время — нужны только камера и микрофон."
    )


def ice_servers(settings: Settings, now: float | None = None) -> list[IceServer]:
    """STUN и, если задан TURN_SECRET, TURN с временным логином.

    Логин по схеме coturn --use-auth-secret (как в Yapp): username = «срок_действия:метка»,
    пароль = base64(HMAC-SHA1(секрет, username)). Секрет в браузер не попадает.
    """
    servers = []
    stun = _split(settings.stun_urls)
    if stun:
        servers.append(IceServer(urls=stun))
    turn = _split(settings.turn_urls)
    if turn and settings.turn_secret:
        expires = int((now if now is not None else time.time()) + TURN_TTL)
        username = f"{expires}:deti"
        digest = hmac.new(settings.turn_secret.encode(), username.encode(), hashlib.sha1).digest()
        servers.append(
            IceServer(urls=turn, username=username, credential=base64.b64encode(digest).decode())
        )
    return servers


def _split(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]
