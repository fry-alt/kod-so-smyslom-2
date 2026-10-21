"""Дашборды кабинета координатора на маленькой базе с известными цифрами.

NOW — среда 21 октября 2026, 12:00. Данные пишем прямо в БД, чтобы задать даты в прошлом.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import Session

from app.db import get_engine, init_db
from app.models import Interview, InterviewResult, Opportunity, Participation, Volunteer
from app.services import dashboard

NOW = datetime(2026, 10, 21, 12, 0)


def add(session: Session, row):
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def volunteer(session, name, status="new", hours=0.0, days_ago=1, **answers) -> Volunteer:
    answers = {
        "about": "демо",
        "occupation": "other",
        "region": "moscow",
        "formats": ["offline"],
        "availability": [],
        **answers,
    }
    return add(
        session,
        Volunteer(
            name=name,
            contact="+7 900 000-00-00",
            answers=answers,
            status=status,
            hours=hours,
            created_at=(NOW - timedelta(days=days_ago)).replace(tzinfo=UTC),
        ),
    )


def opportunity(session, starts_at, slots=1, hours=3.0, **changes) -> Opportunity:
    return add(
        session,
        Opportunity(
            title=f"Занятие {starts_at:%d.%m}",
            starts_at=starts_at,
            slots=slots,
            hours=hours,
            **changes,
        ),
    )


def participation(session, o, v, status, hours=0.0) -> Participation:
    return add(
        session, Participation(opportunity_id=o.id, volunteer_id=v.id, status=status, hours=hours)
    )


def interview(session, v, starts_at, status="scheduled") -> Interview:
    return add(
        session,
        Interview(volunteer_id=v.id, starts_at=starts_at, status=status, token=f"t{v.id}{status}"),
    )


@pytest.fixture
def db():
    """Семь волонтёров, четыре занятия, четыре собеседования — на каждый блок дашборда."""
    init_db()
    with Session(get_engine()) as s:
        new_old = volunteer(s, "Ждёт давно", days_ago=5, occupation="schoolkid")
        booked = volunteer(s, "Назначено сегодня")
        overdue = volunteer(s, "Просрочено")
        trained = volunteer(s, "Прошёл обучение", status="trained")
        active = volunteer(
            s, "Активная", status="active", hours=3, availability=["weekday_morning"]
        )
        sleepy = volunteer(s, "Ни разу", status="approved", availability=["weekend"])
        old = volunteer(s, "Давно был", status="approved", hours=2, formats=["offline", "online"])

        past = opportunity(s, NOW - timedelta(days=10, hours=2), slots=3)  # вс 11 октября, 10:00
        participation(s, past, active, "attended", hours=3)
        long_ago = opportunity(s, NOW - timedelta(days=100), hours=2)
        participation(s, long_ago, old, "attended", hours=2)
        soon = opportunity(s, datetime(2026, 10, 23, 10, 0), slots=3)  # пт, будни утро, Москва очно
        participation(s, soon, active, "confirmed")
        online = opportunity(
            s, datetime(2026, 11, 10, 18, 0), slots=2, format="online", region="other"
        )
        participation(s, online, sleepy, "responded")

        interview(s, booked, datetime(2026, 10, 21, 15, 0))
        interview(s, overdue, datetime(2026, 10, 20, 15, 0))
        interview(s, new_old, datetime(2026, 10, 21, 16, 0), status="canceled")
        done = interview(s, trained, datetime(2026, 10, 10, 15, 0), status="done")
        add(
            s,
            InterviewResult(
                interview_id=done.id,
                motivation=5,
                readiness=4,
                regularity=4,
                decision="next",
                roles=[],
            ),
        )
        yield s


def names(items) -> list[str]:
    return [i.volunteer.name for i in items]


def test_today_interviews_overdue_first(db):
    today = dashboard.today(db, NOW)
    assert names(today.interviews) == ["Просрочено", "Назначено сегодня"]
    assert [i.overdue for i in today.interviews] == [True, False]


def test_today_waiting_lists(db):
    today = dashboard.today(db, NOW)
    assert names(today.new_without_interview) == ["Ждёт давно"]  # отменённое не считается
    assert today.new_without_interview[0].days == 5
    assert names(today.awaiting_approval) == ["Прошёл обучение"]
    assert [(p.volunteer.name, p.opportunity_title) for p in today.pending_responses] == [
        ("Ни разу", "Занятие 10.11")
    ]


def test_today_understaffed_and_counters(db):
    today = dashboard.today(db, NOW)
    assert [(u.title, u.taken, u.missing) for u in today.understaffed] == [("Занятие 23.10", 1, 2)]
    c = today.counters
    assert (c.volunteers, c.active, c.hours_total, c.hours_month) == (7, 1, 5, 3)


def test_today_api(client):
    r = client.get("/dashboard/today")
    assert r.status_code == 200, r.text
    assert r.json()["counters"]["volunteers"] == 0


def test_funnel(db):
    funnel = {row.step: row for row in dashboard.analytics(db, NOW).funnel}
    assert list(funnel) == [
        "applied",
        "interviewed",
        "trained",
        "approved",
        "participated",
        "active",
    ]
    assert [funnel[s].count for s in funnel] == [7, 4, 4, 3, 2, 1]
    assert funnel["applied"].by_occupation["schoolkid"] == 1
    assert (
        funnel["interviewed"].by_occupation["schoolkid"] == 0
    )  # школьник отвалился до собеседования
    assert set(funnel["applied"].by_occupation) == {
        "student",
        "pensioner",
        "remote",
        "employed",
        "schoolkid",
        "other",
    }


def test_supply_and_demand(db):
    a = dashboard.analytics(db, NOW)
    by_time = {r.key: (r.demand, r.supply) for r in a.by_time}
    assert list(by_time) == ["weekday_morning", "weekday_day", "weekday_evening", "weekend"]
    # будни утро: 2 свободных места; свободны «Активная» и «Давно был» (не отметил время — свободен всегда)
    assert by_time["weekday_morning"] == (2, 2)
    assert by_time["weekday_evening"] == (2, 1)  # онлайн-занятие 10.11 в 18:00
    assert by_time["weekend"] == (0, 2)
    by_region = {r.key: (r.demand, r.supply) for r in a.by_region}
    assert by_region == {
        "moscow": (2, 3),
        "online": (2, 1),
    }  # регионы без спроса и людей не показываем


def test_activity(db):
    a = dashboard.analytics(db, NOW)
    assert len(a.weeks) == 12
    assert a.weeks[-1].week_start.isoformat() == "2026-10-19"  # понедельник текущей недели
    assert sum(w.hours for w in a.weeks) == 3  # занятие 100 дней назад — за окном
    assert [(t.volunteer.name, t.hours) for t in a.top] == [("Активная", 3)]
    assert [(d.volunteer.name, d.days) for d in a.dormant] == [
        ("Ни разу", None),
        ("Давно был", 100),
    ]


def test_analytics_api(client):
    r = client.get("/dashboard/analytics")
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["funnel"]) == 6 and len(body["by_time"]) == 4 and len(body["weeks"]) == 12
