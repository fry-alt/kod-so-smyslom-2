from datetime import datetime

from app.services.opportunities import time_slot

PHOTO = {
    "title": "Фотосъёмка изделий для каталога",
    "role_code": "product_photographer",
    "starts_at": "2026-10-31T12:00:00",  # суббота
    "region": "moscow",
    "format": "offline",
    "slots": 1,
    "hours": 4,
}

FORM = {
    "name": "Олег Демо",
    "contact": "+7 900 000-00-02",
    "answers": {
        "about": "Работаю инженером, в выходные снимаю",
        "skills": "фото, своя камера",
        "availability": ["weekend"],
        "occupation": "employed",
        "region": "moscow",
    },
}


def create_volunteer(client, **answers) -> dict:
    form = {**FORM, "answers": {**FORM["answers"], **answers}}
    r = client.post("/volunteers", json=form)
    assert r.status_code == 200, r.text
    return r.json()


def create_opportunity(client, **changes) -> dict:
    r = client.post("/opportunities", json={**PHOTO, **changes})
    assert r.status_code == 200, r.text
    return r.json()


def test_full_chain_respond_invite_confirm_attend(client):
    opp = create_opportunity(client)
    assert (opp["taken"], opp["recommended"], opp["my_status"]) == (0, False, None)
    first = create_volunteer(client)
    second = create_volunteer(client, about="Студент, люблю фотографировать")

    responded = client.post(
        f"/opportunities/{opp['id']}/respond", json={"volunteer_id": first["id"]}
    )
    assert responded.status_code == 200
    responded = responded.json()
    assert responded["status"] == "responded"
    assert responded["opportunity_title"] == PHOTO["title"]
    assert responded["volunteer_name"] == FORM["name"]

    r = client.post(f"/opportunities/{opp['id']}/invite", json={"volunteer_ids": [second["id"]]})
    assert r.status_code == 200
    invited = r.json()[0]
    assert invited["status"] == "invited"

    participants = client.get(f"/opportunities/{opp['id']}/participants").json()
    assert [p["id"] for p in participants] == [responded["id"], invited["id"]]

    r = client.patch(f"/participations/{responded['id']}", json={"status": "confirmed"})
    assert r.json()["status"] == "confirmed"
    assert client.get(f"/opportunities/{opp['id']}").json()["taken"] == 1

    # место одно — второго подтвердить нельзя
    r = client.patch(f"/participations/{invited['id']}", json={"status": "confirmed"})
    assert r.status_code == 409
    assert "места" in r.json()["detail"]

    r = client.patch(f"/participations/{responded['id']}", json={"status": "attended"})
    assert (r.json()["status"], r.json()["hours"]) == ("attended", 4)
    assert client.get(f"/volunteers/{first['id']}").json()["hours"] == 4

    # повторная отметка не начисляет часы второй раз
    client.patch(f"/participations/{responded['id']}", json={"status": "attended"})
    assert client.get(f"/volunteers/{first['id']}").json()["hours"] == 4

    history = client.get(f"/volunteers/{first['id']}/participations").json()
    assert [(p["opportunity_id"], p["status"], p["hours"]) for p in history] == [
        (opp["id"], "attended", 4)
    ]


def test_undo_attended_returns_hours(client):
    opp = create_opportunity(client)
    v = create_volunteer(client)
    p = client.post(f"/opportunities/{opp['id']}/respond", json={"volunteer_id": v["id"]}).json()
    client.patch(f"/participations/{p['id']}", json={"status": "attended"})
    r = client.patch(f"/participations/{p['id']}", json={"status": "declined"})
    assert (r.json()["status"], r.json()["hours"]) == ("declined", 0)
    assert client.get(f"/volunteers/{v['id']}").json()["hours"] == 0


def test_respond_and_invite_do_not_duplicate(client):
    opp = create_opportunity(client, slots=5)
    v = create_volunteer(client)
    url = f"/opportunities/{opp['id']}"
    first = client.post(f"{url}/respond", json={"volunteer_id": v["id"]}).json()
    again = client.post(f"{url}/respond", json={"volunteer_id": v["id"]}).json()
    assert again["id"] == first["id"]

    # откликнулся сам — приглашение статус не меняет
    invited = client.post(f"{url}/invite", json={"volunteer_ids": [v["id"], v["id"]]}).json()
    assert [(p["id"], p["status"]) for p in invited] == [(first["id"], "responded")]

    # после отказа можно откликнуться снова
    client.patch(f"/participations/{first['id']}", json={"status": "declined"})
    again = client.post(f"{url}/respond", json={"volunteer_id": v["id"]}).json()
    assert (again["id"], again["status"]) == (first["id"], "responded")
    assert len(client.get(f"{url}/participants").json()) == 1


def test_recommended_and_my_status_for_volunteer(client):
    v = create_volunteer(client)  # Москва, очно, выходные, фото
    photo = create_opportunity(client)
    other_region = create_opportunity(client, region="yaroslavl")
    weekday = create_opportunity(client, starts_at="2026-10-27T10:00:00")  # вторник утром
    no_skill = create_opportunity(client, role_code="lawyer_pro_bono")
    online = create_opportunity(client, role_code="video_editor", format="online")
    client.post(f"/opportunities/{photo['id']}/respond", json={"volunteer_id": v["id"]})

    feed = {
        o["id"]: o for o in client.get("/opportunities", params={"volunteer_id": v["id"]}).json()
    }
    assert feed[photo["id"]]["recommended"] is True
    assert feed[photo["id"]]["my_status"] == "responded"
    for opp in (other_region, weekday, no_skill, online):
        assert feed[opp["id"]]["recommended"] is False, opp
        assert feed[opp["id"]]["my_status"] is None

    # онлайн-задаче регион неважен
    remote = create_volunteer(
        client, region="north_ossetia", formats=["online"], skills="видеомонтаж, веду соцсети"
    )
    feed = {
        o["id"]: o
        for o in client.get("/opportunities", params={"volunteer_id": remote["id"]}).json()
    }
    assert feed[online["id"]]["recommended"] is True
    assert feed[photo["id"]]["recommended"] is False

    # без volunteer_id — общий каталог, ближайшие сверху
    catalog = client.get("/opportunities").json()
    assert catalog[0]["id"] == weekday["id"]
    assert not any(o["recommended"] for o in catalog)


def test_coordinator_statuses_only_and_404(client):
    opp = create_opportunity(client)
    v = create_volunteer(client)
    p = client.post(f"/opportunities/{opp['id']}/respond", json={"volunteer_id": v["id"]}).json()
    assert client.patch(f"/participations/{p['id']}", json={"status": "invited"}).status_code == 409
    assert client.patch(f"/participations/{p['id']}", json={"status": "wrong"}).status_code == 422

    assert client.get("/opportunities/999").status_code == 404
    assert client.get("/opportunities", params={"volunteer_id": 999}).status_code == 404
    assert (
        client.post("/opportunities/999/respond", json={"volunteer_id": v["id"]}).status_code == 404
    )
    assert (
        client.post(f"/opportunities/{opp['id']}/respond", json={"volunteer_id": 999}).status_code
        == 404
    )
    assert (
        client.post(f"/opportunities/{opp['id']}/invite", json={"volunteer_ids": [999]}).status_code
        == 404
    )
    assert client.get("/opportunities/999/participants").status_code == 404
    assert client.get("/volunteers/999/participations").status_code == 404
    assert client.patch("/participations/999", json={"status": "confirmed"}).status_code == 404


def test_create_validates(client):
    assert client.post("/opportunities", json={**PHOTO, "slots": 0}).status_code == 422
    assert client.post("/opportunities", json={**PHOTO, "region": "mars"}).status_code == 422


def test_time_slot():
    assert time_slot(datetime(2026, 10, 31, 12)) == "weekend"  # суббота
    assert time_slot(datetime(2026, 10, 27, 10)) == "weekday_morning"
    assert time_slot(datetime(2026, 10, 27, 14)) == "weekday_day"
    assert time_slot(datetime(2026, 10, 28, 19)) == "weekday_evening"


def test_volunteer_cancels_response_and_can_respond_again(client):
    opp = create_opportunity(client, slots=2)
    v = create_volunteer(client)
    url = f"/opportunities/{opp['id']}"
    p = client.post(f"{url}/respond", json={"volunteer_id": v["id"]}).json()
    client.patch(f"/participations/{p['id']}", json={"status": "confirmed"})
    assert client.get(url).json()["taken"] == 1

    # отменил запись — место освободилось
    r = client.post(f"{url}/cancel", json={"volunteer_id": v["id"]})
    assert r.status_code == 200, r.text
    assert (r.json()["id"], r.json()["status"]) == (p["id"], "declined")
    assert client.get(url).json()["taken"] == 0

    # передумал — откликается снова той же записью
    again = client.post(f"{url}/respond", json={"volunteer_id": v["id"]}).json()
    assert (again["id"], again["status"]) == (p["id"], "responded")

    # прошедшее участие с часами не отменяется
    client.patch(f"/participations/{p['id']}", json={"status": "attended"})
    assert client.post(f"{url}/cancel", json={"volunteer_id": v["id"]}).status_code == 409


def test_cancel_without_response_and_404(client):
    opp = create_opportunity(client)
    v = create_volunteer(client)
    url = f"/opportunities/{opp['id']}/cancel"
    assert client.post(url, json={"volunteer_id": v["id"]}).status_code == 409
    assert client.post(url, json={"volunteer_id": 999}).status_code == 404
    assert (
        client.post("/opportunities/999/cancel", json={"volunteer_id": v["id"]}).status_code == 404
    )
