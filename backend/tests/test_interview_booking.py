"""Волонтёр сам записывается на собеседование (T-87)."""

from datetime import datetime

from sqlmodel import Session
from tests.test_interviews import create_volunteer, schedule

from app.db import get_engine
from app.services import interviews

# среда, 21 октября 2026, 9:00 по Москве
NOW = datetime(2026, 10, 21, 9, 0)


def slots_at(now: datetime = NOW) -> list[datetime]:
    with Session(get_engine()) as session:
        return interviews.free_slots(session, now)


def test_free_slots_are_weekdays_working_hours(client):
    slots = slots_at()
    # первое — не раньше чем через 2 часа, по сетке в полчаса
    assert slots[0] == datetime(2026, 10, 21, 11, 0)
    assert all(s.weekday() < 5 for s in slots)
    assert all(10 <= s.hour < 18 and s.minute in (0, 30) for s in slots)
    assert datetime(2026, 10, 21, 17, 30) in slots
    assert datetime(2026, 10, 24, 12, 0) not in slots  # суббота
    assert max(slots).date() <= datetime(2026, 11, 4).date()


def test_scheduled_interview_takes_overlapping_slots(client):
    v = create_volunteer(client)
    schedule(client, v, "2026-10-22T15:10:00")  # не по сетке — занимает 15:00 и 15:30
    slots = slots_at()
    assert datetime(2026, 10, 22, 15, 0) not in slots
    assert datetime(2026, 10, 22, 15, 30) not in slots
    assert datetime(2026, 10, 22, 14, 30) in slots
    assert datetime(2026, 10, 22, 16, 0) in slots


def test_book_cancel_and_rebook(client):
    v = create_volunteer(client)
    r = client.get("/interviews/slots").json()
    assert r["minutes"] == 30
    first, second = r["slots"][0], r["slots"][1]

    booked = client.post(f"/volunteers/{v}/interviews/book", json={"starts_at": first})
    assert booked.status_code == 200, booked.text
    assert booked.json()["status"] == "scheduled"
    assert first not in client.get("/interviews/slots").json()["slots"]

    # вторую запись, не отменив первую, не даём
    again = client.post(f"/volunteers/{v}/interviews/book", json={"starts_at": second})
    assert again.status_code == 409
    assert "отмените" in again.json()["detail"]

    client.patch(f"/interviews/{booked.json()['id']}", json={"status": "canceled"})
    assert first in client.get("/interviews/slots").json()["slots"]
    assert (
        client.post(f"/volunteers/{v}/interviews/book", json={"starts_at": second}).status_code
        == 200
    )


def test_cannot_book_taken_or_off_grid_time(client):
    a, b = create_volunteer(client), create_volunteer(client)
    slot = client.get("/interviews/slots").json()["slots"][0]
    assert (
        client.post(f"/volunteers/{a}/interviews/book", json={"starts_at": slot}).status_code == 200
    )
    taken = client.post(f"/volunteers/{b}/interviews/book", json={"starts_at": slot})
    assert taken.status_code == 409
    assert "занято" in taken.json()["detail"]
    night = client.post(
        f"/volunteers/{b}/interviews/book", json={"starts_at": "2030-01-01T03:00:00"}
    )
    assert night.status_code == 409
    assert (
        client.post("/volunteers/999/interviews/book", json={"starts_at": slot}).status_code == 404
    )
