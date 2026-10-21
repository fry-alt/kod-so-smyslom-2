"""Дашборды кабинета координатора (T-66): «что сегодня» и аналитика.

LLM здесь не нужен. Всё считаем в Python по выборкам из БД: в базе фонда сотни записей, так проще читать.
Дата участия — начало занятия: у участия нет даты «участвовал», а дата занятия честнее.
Время везде местное (московское), без часового пояса — как starts_at у занятий и собеседований.
"""

from collections import Counter, defaultdict
from collections.abc import Callable
from datetime import date, datetime, time, timedelta, timezone
from typing import get_args

from sqlalchemy import func
from sqlmodel import Session, select

from app.models import Interview, Opportunity, Participation, QuizAttempt, Volunteer
from app.schemas import (
    Answers,
    Availability,
    Counters,
    DashboardAnalytics,
    DashboardToday,
    Dormant,
    FunnelRow,
    FunnelStep,
    Occupation,
    PendingResponse,
    Region,
    SupplyRow,
    TodayInterview,
    TopVolunteer,
    Understaffed,
    VolunteerRef,
    WaitingVolunteer,
    WeekRow,
)
from app.services.opportunities import time_slot
from app.services.volunteers import training_score

MSK = timezone(timedelta(hours=3), "MSK")  # фонд работает по Москве; летнего времени нет
ACTIVE_DAYS = 60  # «активен» — участвовал за столько дней
UNDERSTAFFED_DAYS = 7  # «не хватает людей» — смотрим на неделю вперёд
TAKEN = ("confirmed", "attended")  # как в каталоге возможностей
DORMANT_DAYS = 45  # «засыпает» — допущен, но не участвовал столько дней
DEMAND_DAYS = 30  # спрос — занятия на месяц вперёд
WEEKS = 12
TRAINED = ("trained", "approved", "active")
APPROVED = ("approved", "active")


def local_now() -> datetime:
    """Сейчас по Москве, без часового пояса — так хранятся starts_at."""
    return datetime.now(MSK).replace(tzinfo=None)


class Data:
    """Всё нужное для дашбордов одной выборкой."""

    def __init__(self, session: Session):
        self.volunteers = list(session.exec(select(Volunteer).order_by(Volunteer.id)).all())
        self.opportunities = {o.id: o for o in session.exec(select(Opportunity)).all()}
        self.participations = list(session.exec(select(Participation)).all())
        self.interviews = list(session.exec(select(Interview)).all())
        self.ref = {v.id: VolunteerRef(id=v.id, name=v.name) for v in self.volunteers}

    def attended(self) -> list[tuple[Participation, Opportunity]]:
        return [
            (p, self.opportunities[p.opportunity_id])
            for p in self.participations
            if p.status == "attended"
        ]

    def taken(self, opportunity_id: int) -> int:
        return sum(
            p.opportunity_id == opportunity_id and p.status in TAKEN for p in self.participations
        )


def today(session: Session, now: datetime) -> DashboardToday:
    data = Data(session)
    end_of_day = datetime.combine(now.date(), time.max)

    interviews = [
        TodayInterview(
            interview_id=i.id,
            volunteer=data.ref[i.volunteer_id],
            starts_at=i.starts_at,
            token=i.token,
            overdue=i.starts_at < now,
        )
        for i in sorted(data.interviews, key=lambda i: i.starts_at)
        if i.status == "scheduled" and i.starts_at <= end_of_day
    ]

    booked = {i.volunteer_id for i in data.interviews if i.status != "canceled"}
    new_without_interview = sorted(
        (
            waiting(data.ref[v.id], naive(v.created_at), now)
            for v in data.volunteers
            if v.status == "new" and v.id not in booked
        ),
        key=lambda w: w.since,
    )

    last_quiz = dict(
        session.exec(
            select(QuizAttempt.volunteer_id, func.max(QuizAttempt.created_at)).group_by(
                QuizAttempt.volunteer_id
            )
        ).all()
    )
    awaiting_approval = sorted(
        (
            waiting(
                data.ref[v.id],
                naive(last_quiz.get(v.id) or v.created_at),
                now,
                training_score(session, v.id),
            )
            for v in data.volunteers
            if v.status == "trained"
        ),
        key=lambda w: w.since,
    )

    upcoming = sorted(
        (o for o in data.opportunities.values() if o.starts_at >= now), key=lambda o: o.starts_at
    )
    pending_responses = [
        PendingResponse(
            participation_id=p.id,
            opportunity_id=o.id,
            opportunity_title=o.title,
            starts_at=o.starts_at,
            volunteer=data.ref[p.volunteer_id],
        )
        for o in upcoming
        for p in data.participations
        if p.opportunity_id == o.id and p.status == "responded"
    ]

    week_end = now + timedelta(days=UNDERSTAFFED_DAYS)
    understaffed = []
    for o in upcoming:
        taken = data.taken(o.id)
        if o.starts_at <= week_end and taken < o.slots:
            understaffed.append(
                Understaffed(
                    opportunity_id=o.id,
                    title=o.title,
                    starts_at=o.starts_at,
                    slots=o.slots,
                    taken=taken,
                    missing=o.slots - taken,
                )
            )

    return DashboardToday(
        interviews=interviews,
        new_without_interview=new_without_interview,
        awaiting_approval=awaiting_approval,
        pending_responses=pending_responses,
        understaffed=understaffed,
        counters=counters(data, now),
    )


def counters(data: Data, now: datetime) -> Counters:
    active_since = now - timedelta(days=ACTIVE_DAYS)
    month_start = datetime.combine(now.date().replace(day=1), time.min)
    attended = [(p, o) for p, o in data.attended() if o.starts_at <= now]
    return Counters(
        volunteers=len(data.volunteers),
        active=len({p.volunteer_id for p, o in attended if o.starts_at >= active_since}),
        # сумма из базы: координатор может поправить часы вручную — цифра совпадёт с карточкой
        hours_total=sum(v.hours for v in data.volunteers),
        hours_month=sum(p.hours for p, o in attended if o.starts_at >= month_start),
    )


def waiting(
    ref: VolunteerRef, since: datetime, now: datetime, score: int | None = None
) -> WaitingVolunteer:
    return WaitingVolunteer(
        volunteer=ref, since=since, days=max(0, (now - since).days), training_score=score
    )


def naive(value: datetime) -> datetime:
    """created_at пишется с часовым поясом UTC, а из SQLite читается без него — приводим к одному виду."""
    return value.replace(tzinfo=None)


def analytics(session: Session, now: datetime) -> DashboardAnalytics:
    data = Data(session)
    return DashboardAnalytics(
        funnel=funnel(data, now),
        **supply_and_demand(data, now),
        **activity(data, now),
    )


def funnel(data: Data, now: datetime) -> list[FunnelRow]:
    """Шаги «дошёл хотя бы до». Собеседованным считаем и тех, кто уже дальше «новой анкеты»:
    до T-59 собеседования шли без системы."""
    attended_at: defaultdict[int, list[datetime]] = defaultdict(list)
    for p, o in data.attended():
        if o.starts_at <= now:
            attended_at[p.volunteer_id].append(o.starts_at)
    interviewed = {i.volunteer_id for i in data.interviews if i.status == "done"}
    active_since = now - timedelta(days=ACTIVE_DAYS)
    passed: dict[FunnelStep, Callable[[Volunteer], bool]] = {
        "applied": lambda v: True,
        "interviewed": lambda v: v.id in interviewed or v.status != "new",
        "trained": lambda v: v.status in TRAINED,
        "approved": lambda v: v.status in APPROVED,
        "participated": lambda v: bool(attended_at[v.id]),
        "active": lambda v: any(d >= active_since for d in attended_at[v.id]),
    }
    rows = []
    for step, check in passed.items():
        reached = [v for v in data.volunteers if check(v)]
        by_occupation = {o: 0 for o in get_args(Occupation)}
        by_occupation.update(Counter(v.answers.get("occupation", "other") for v in reached))
        rows.append(FunnelRow(step=step, count=len(reached), by_occupation=by_occupation))
    return rows


def supply_and_demand(data: Data, now: datetime) -> dict[str, list[SupplyRow]]:
    """Спрос — свободные места в ближайших занятиях, предложение — допущенные, кому подходит.
    Время — как в «подходит вам»: не отметил, когда свободен, — значит свободен всегда."""
    horizon = now + timedelta(days=DEMAND_DAYS)
    free = {
        o.id: max(0, o.slots - data.taken(o.id))
        for o in data.opportunities.values()
        if now <= o.starts_at <= horizon
    }
    upcoming = [data.opportunities[i] for i in free]
    approved = [Answers.model_validate(v.answers) for v in data.volunteers if v.status in APPROVED]

    by_time = [
        SupplyRow(
            key=slot,
            demand=sum(free[o.id] for o in upcoming if time_slot(o.starts_at) == slot),
            supply=sum(not a.availability or slot in a.availability for a in approved),
        )
        for slot in get_args(Availability)
    ]

    by_region = []
    for key in [*get_args(Region), "online"]:
        if key == "online":
            demand = sum(free[o.id] for o in upcoming if o.format == "online")
            supply = sum("online" in a.formats for a in approved)
        else:
            demand = sum(free[o.id] for o in upcoming if o.format == "offline" and o.region == key)
            supply = sum(a.region == key and "offline" in a.formats for a in approved)
        if demand or supply:
            by_region.append(SupplyRow(key=key, demand=demand, supply=supply))
    return {"by_time": by_time, "by_region": by_region}


def activity(data: Data, now: datetime) -> dict[str, list]:
    """Часы и участия по неделям, топ-5 и «засыпающие»."""
    this_monday = now.date() - timedelta(days=now.weekday())
    mondays = [this_monday - timedelta(weeks=n) for n in range(WEEKS - 1, -1, -1)]
    window_start = datetime.combine(mondays[0], time.min)

    hours: defaultdict[date, float] = defaultdict(float)
    counts: Counter[date] = Counter()
    per_volunteer: defaultdict[int, list[float]] = defaultdict(list)
    last: dict[int, datetime] = {}
    for p, o in data.attended():
        if o.starts_at > now:
            continue
        last[p.volunteer_id] = max(last.get(p.volunteer_id, o.starts_at), o.starts_at)
        if o.starts_at >= window_start:
            day = o.starts_at.date()
            monday = day - timedelta(days=day.weekday())
            hours[monday] += p.hours
            counts[monday] += 1
            per_volunteer[p.volunteer_id].append(p.hours)

    weeks = [WeekRow(week_start=m, hours=hours[m], participations=counts[m]) for m in mondays]
    top = sorted(
        (
            TopVolunteer(volunteer=data.ref[vid], hours=sum(h), participations=len(h))
            for vid, h in per_volunteer.items()
        ),
        key=lambda t: (-t.hours, t.volunteer.name),
    )[:5]

    dormant = []
    for v in data.volunteers:
        if v.status not in APPROVED:
            continue
        seen = last.get(v.id)
        if seen is None:
            dormant.append(Dormant(volunteer=data.ref[v.id], last_attended=None, days=None))
        elif (now - seen).days >= DORMANT_DAYS:
            days = (now.date() - seen.date()).days
            dormant.append(Dormant(volunteer=data.ref[v.id], last_attended=seen.date(), days=days))
    # дольше всех не были — выше; кто ни разу не участвовал — в самом верху
    dormant.sort(key=lambda d: (d.days is not None, -(d.days or 0)))
    return {"weeks": weeks, "top": top, "dormant": dormant}
