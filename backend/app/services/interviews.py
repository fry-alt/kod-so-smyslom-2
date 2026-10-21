"""Видеособеседование координатора с волонтёром (T-59).

Координатор назначает время → у собеседования появляется случайный token, ссылка на звонок
/call/<token> уходит волонтёру в Telegram. Статусы волонтёра не меняются: после звонка
координатор отмечает «прошло», пишет заметку и сам решает, что дальше.

Сам звонок — WebRTC между двумя браузерами, как в Yapp: бэкенд только знакомит их
(api/calls.py) и выдаёт адреса STUN/TURN (ice_servers).
"""

import base64
import hashlib
import hmac
import secrets
import time
from datetime import datetime

from sqlmodel import Session, col, select

from app.config import Settings, get_settings
from app.models import Interview, Volunteer
from app.schemas import IceServer, InterviewStatus
from app.services import notify

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
