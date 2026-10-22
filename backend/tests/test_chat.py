"""Переписка фонда с волонтёром (T-100)."""

from tests.test_opportunities import FORM, create_opportunity, create_volunteer

from app.services.chat import NOTIFY_TEXT, clean_text
from conftest import telegram_headers


def send(client, volunteer_id: int, sender: str, text: str, **extra) -> dict:
    r = client.post(
        f"/volunteers/{volunteer_id}/dialog/messages",
        json={"sender": sender, "text": text, **extra},
    )
    assert r.status_code == 200, r.text
    return r.json()


def dialog(client, volunteer_id: int, reader: str) -> dict:
    r = client.get(f"/volunteers/{volunteer_id}/dialog", params={"reader": reader})
    assert r.status_code == 200, r.text
    return r.json()


def test_coordinator_and_volunteer_write_in_one_dialog(client):
    v = create_volunteer(client)
    opp = create_opportunity(client)
    # ещё не писали — переписка пустая, в списке фонда её нет
    assert dialog(client, v["id"], "volunteer")["messages"] == []
    assert client.get("/dialogs").json() == []

    first = send(
        client, v["id"], "coordinator", "Здравствуйте! Сможете в субботу?", opportunity_id=opp["id"]
    )
    assert first["opportunity_title"] == opp["title"]

    # у волонтёра — одно новое; у координатора своё сообщение уже прочитано
    mine = dialog(client, v["id"], "volunteer")
    assert [m["text"] for m in mine["messages"]] == ["Здравствуйте! Сможете в субботу?"]
    assert mine["unread"] == 1
    assert mine["volunteer"] == {"id": v["id"], "name": v["name"]}
    assert dialog(client, v["id"], "coordinator")["unread"] == 0

    r = client.post(f"/volunteers/{v['id']}/dialog/read", json={"reader": "volunteer"})
    assert r.json() == {"unread": 0}
    assert dialog(client, v["id"], "volunteer")["unread"] == 0
    # координатор видит, что волонтёр дочитал
    assert dialog(client, v["id"], "coordinator")["their_read_id"] == first["id"]

    send(client, v["id"], "volunteer", "Да, смогу")
    send(client, v["id"], "volunteer", "Во сколько приходить?")
    [row] = client.get("/dialogs").json()
    assert row["volunteer"]["id"] == v["id"]
    assert row["unread"] == 2
    assert row["last"]["text"] == "Во сколько приходить?"

    r = client.post(f"/volunteers/{v['id']}/dialog/read", json={"reader": "coordinator"})
    assert r.json() == {"unread": 0}
    texts = [(m["sender"], m["text"]) for m in dialog(client, v["id"], "coordinator")["messages"]]
    assert texts == [
        ("coordinator", "Здравствуйте! Сможете в субботу?"),
        ("volunteer", "Да, смогу"),
        ("volunteer", "Во сколько приходить?"),
    ]


def test_fresh_dialogs_on_top_and_unread_total(client):
    a = create_volunteer(client)
    b = create_volunteer(client)
    send(client, a["id"], "volunteer", "Вопрос от первого")
    send(client, b["id"], "volunteer", "Вопрос от второго")
    assert [d["volunteer"]["id"] for d in client.get("/dialogs").json()] == [b["id"], a["id"]]
    # прочитали одну переписку — во второй осталось одно новое
    r = client.post(f"/volunteers/{a['id']}/dialog/read", json={"reader": "coordinator"})
    assert r.json() == {"unread": 1}


def test_telegram_notice_without_text_once_per_batch(client, telegram):
    tg = client.post("/volunteers", json=FORM, headers=telegram_headers(555)).json()
    telegram.clear()

    send(client, tg["id"], "coordinator", "Секретный текст")
    send(
        client, tg["id"], "coordinator", "Ещё одно"
    )  # пока первое не прочитано — второго уведомления нет
    assert [m["text"] for m in telegram] == [NOTIFY_TEXT]
    assert "Секретный" not in telegram[0]["text"]

    client.post(f"/volunteers/{tg['id']}/dialog/read", json={"reader": "volunteer"})
    send(client, tg["id"], "coordinator", "После прочтения")
    assert len(telegram) == 2
    # волонтёр пишет фонду — в Telegram ничего не уходит
    send(client, tg["id"], "volunteer", "Ответ")
    assert len(telegram) == 2


def test_errors(client):
    v = create_volunteer(client)
    url = f"/volunteers/{v['id']}/dialog/messages"
    assert client.post(url, json={"sender": "volunteer", "text": "  \n​ "}).status_code == 422
    assert client.post(url, json={"sender": "fund", "text": "привет"}).status_code == 422
    assert client.post(url, json={"sender": "volunteer", "text": "x" * 1001}).status_code == 422
    r = client.post(url, json={"sender": "volunteer", "text": "о занятии", "opportunity_id": 999})
    assert r.status_code == 422
    assert "занятия нет" in r.json()["detail"]
    assert (
        client.post(
            "/volunteers/999/dialog/messages", json={"sender": "volunteer", "text": "a"}
        ).status_code
        == 404
    )
    assert client.get("/volunteers/999/dialog", params={"reader": "volunteer"}).status_code == 404


def test_clean_text():
    assert clean_text("  Привет,\r\n\r\n\r\n\r\nкак   дела?​ ") == "Привет,\n\nкак дела?"
