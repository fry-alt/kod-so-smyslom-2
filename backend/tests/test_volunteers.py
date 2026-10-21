import json

from sqlmodel import Session

from app.db import get_engine
from app.models import QuizAttempt

FORM = {
    "name": "Анна Демо",
    "contact": "+7 900 000-00-01",
    "telegram_id": 111,
    "answers": {
        "about": "Студентка-заочница, учусь на педагога",
        "skills": "рисую акварелью, фотографирую",
        "availability": ["weekday_morning", "weekend"],
        "occupation": "student",
        "region": "yaroslavl",
    },
}


def create(client, **changes) -> dict:
    r = client.post("/volunteers", json={**FORM, **changes})
    assert r.status_code == 200, r.text
    return r.json()


def test_create_and_get_volunteer(client):
    v = create(client)
    assert v["id"] > 0
    assert v["status"] == "new"
    assert v["profile"] is not None  # на fake — заглушка по схеме Profile
    assert v["hours"] == 0
    assert v["training_score"] is None
    assert v["answers"]["region"] == "yaroslavl"
    assert v["answers"]["formats"] == ["offline"]  # значение по умолчанию из контракта

    r = client.get(f"/volunteers/{v['id']}")
    assert r.status_code == 200
    assert r.json() == v


def test_create_validates_form(client):
    assert client.post("/volunteers", json={**FORM, "name": ""}).status_code == 422
    bad = {**FORM, "answers": {**FORM["answers"], "region": "mars"}}
    assert client.post("/volunteers", json=bad).status_code == 422


def test_unknown_volunteer_is_404(client):
    assert client.get("/volunteers/999").status_code == 404
    assert client.patch("/volunteers/999", json={"status": "active"}).status_code == 404
    assert client.get("/volunteers/999/notes").status_code == 404
    assert client.post("/volunteers/999/notes", json={"text": "привет"}).status_code == 404


def test_list_filters_by_status(client):
    first = create(client)
    second = create(client, name="Борис Демо")
    client.patch(f"/volunteers/{second['id']}", json={"status": "approved"})

    all_ids = [v["id"] for v in client.get("/volunteers").json()]
    assert all_ids == [second["id"], first["id"]]  # новые сверху

    approved = client.get("/volunteers", params={"status": "approved"}).json()
    assert [v["id"] for v in approved] == [second["id"]]
    assert client.get("/volunteers", params={"status": "wrong"}).status_code == 422


def test_update_status_and_hours(client):
    v = create(client)
    r = client.patch(f"/volunteers/{v['id']}", json={"status": "active", "hours": 4.5})
    assert r.status_code == 200
    assert (r.json()["status"], r.json()["hours"]) == ("active", 4.5)

    # пустые поля не трогают сохранённое
    r = client.patch(f"/volunteers/{v['id']}", json={"hours": 6})
    assert (r.json()["status"], r.json()["hours"]) == ("active", 6)

    assert client.patch(f"/volunteers/{v['id']}", json={"hours": -1}).status_code == 422


def test_notes(client):
    v = create(client)
    url = f"/volunteers/{v['id']}/notes"
    assert client.get(url).json() == []

    r = client.post(url, json={"text": "Позвонили, ждёт мастерскую в субботу"})
    assert r.status_code == 200
    note = r.json()
    assert note["volunteer_id"] == v["id"]
    assert note["author"] == "координатор"

    client.post(url, json={"text": "Пришла на первую смену", "author": "Ольга"})
    texts = [n["text"] for n in client.get(url).json()]
    assert texts == ["Позвонили, ждёт мастерскую в субботу", "Пришла на первую смену"]


def test_training_score_is_average_of_best_attempts(client):
    v = create(client)
    with Session(get_engine()) as session:
        session.add(QuizAttempt(volunteer_id=v["id"], module_id="about", score=50))
        session.add(QuizAttempt(volunteer_id=v["id"], module_id="about", score=90))
        session.add(QuizAttempt(volunteer_id=v["id"], module_id="safety", score=70))
        session.commit()
    assert client.get(f"/volunteers/{v['id']}").json()["training_score"] == 80


def test_roles_empty_without_file(client, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from app.config import get_settings

    get_settings.cache_clear()
    assert client.get("/roles").json() == []


def test_roles_read_from_file(client, tmp_path, monkeypatch):
    role = {
        "code": "photographer",
        "title": "Фотограф",
        "description": "Снять изделия мастерской для каталога",
        "skills": ["фото"],
        "availability": ["weekday_morning"],
        "kind": "episodic",
    }
    (tmp_path / "roles.json").write_text(json.dumps([role], ensure_ascii=False), encoding="utf-8")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from app.config import get_settings

    get_settings.cache_clear()
    roles = client.get("/roles").json()
    assert [r["code"] for r in roles] == ["photographer"]
    assert roles[0]["format"] == "offline"
