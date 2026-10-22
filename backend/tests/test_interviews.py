"""Видеособеседование: назначение, ссылка в Telegram, TURN-логины, сигнальный сервер звонка."""

import base64
import hashlib
import hmac

import pytest
from starlette.websockets import WebSocketDisconnect

from app.config import Settings
from app.services import interviews
from conftest import telegram_headers

FORM = {
    "name": "Ирина Собеседуемая",
    "contact": "+7 900 000-00-59",
    "answers": {"about": "Пенсионерка, вяжу и хочу помогать", "availability": ["weekday_day"]},
}


def create_volunteer(client, telegram_id: int | None = 590590) -> int:
    """Анкета из Mini App — с подписью Telegram; telegram_id=None — анкета с сайта."""
    headers = telegram_headers(telegram_id) if telegram_id else {}
    r = client.post("/volunteers", json=FORM, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def schedule(client, volunteer_id: int, starts_at: str = "2026-10-22T15:00:00") -> dict:
    r = client.post(f"/volunteers/{volunteer_id}/interviews", json={"starts_at": starts_at})
    assert r.status_code == 200, r.text
    return r.json()


def test_schedule_sends_link_to_telegram(client, telegram, monkeypatch):
    monkeypatch.setenv("WEBAPP_URL", "https://deti.example.ru/")
    from app.config import get_settings

    get_settings.cache_clear()
    interview = schedule(client, create_volunteer(client))
    assert interview["status"] == "scheduled"
    assert interview["notified"] is True
    assert len(interview["token"]) >= 20  # ссылку не угадать
    assert len(telegram) == 1
    text = telegram[0]["text"]
    assert telegram[0]["chat_id"] == 590590
    assert "22 октября в 15:00" in text
    assert f"https://deti.example.ru/call/{interview['token']}" in text
    assert FORM["name"] not in text  # имя в сообщение не подставляем — оно и так знает, кто он


def test_schedule_without_telegram_is_not_notified(client, telegram):
    interview = schedule(client, create_volunteer(client, telegram_id=None))
    assert interview["notified"] is False
    assert telegram == []


def test_list_and_update(client):
    volunteer_id = create_volunteer(client)
    first = schedule(client, volunteer_id, "2026-10-22T10:00:00")
    second = schedule(client, volunteer_id, "2026-10-23T10:00:00")
    listed = client.get(f"/volunteers/{volunteer_id}/interviews").json()
    assert [i["id"] for i in listed] == [second["id"], first["id"]]  # последнее сверху

    r = client.patch(f"/interviews/{first['id']}", json={"status": "canceled"})
    assert r.status_code == 200 and r.json()["status"] == "canceled"
    assert client.patch("/interviews/999", json={"status": "done"}).status_code == 404
    assert (
        client.post(
            "/volunteers/999/interviews", json={"starts_at": "2026-10-22T10:00:00"}
        ).status_code
        == 404
    )


def test_call_info(client):
    interview = schedule(client, create_volunteer(client))
    r = client.get(f"/calls/{interview['token']}")
    assert r.status_code == 200
    info = r.json()
    assert info["status"] == "scheduled"
    assert info["starts_at"].startswith("2026-10-22T15:00")
    assert info["ice_servers"][0]["urls"]  # без TURN — хотя бы STUN
    assert FORM["name"] not in str(info) and FORM["contact"] not in str(info)

    r = client.get("/calls/nope")
    assert r.status_code == 404
    assert "недействительна" in r.json()["detail"]


def test_ice_servers_turn_credentials():
    settings = Settings(
        turn_urls="turn:t.example:3478?transport=udp, turn:t.example:3478", turn_secret="s3cret"
    )
    stun, turn = interviews.ice_servers(settings, now=1000)
    assert stun.urls == ["stun:stun.l.google.com:19302"]
    assert turn.urls == ["turn:t.example:3478?transport=udp", "turn:t.example:3478"]
    assert turn.username == f"{1000 + interviews.TURN_TTL}:deti"
    expected = base64.b64encode(
        hmac.new(b"s3cret", turn.username.encode(), hashlib.sha1).digest()
    ).decode()
    assert turn.credential == expected

    # без секрета TURN не выдаём — только STUN
    assert (
        len(interviews.ice_servers(Settings(turn_urls="turn:t.example:3478", turn_secret=""))) == 1
    )


# ---------- сигнальный сервер ----------


def join(ws, role: str, mic: bool = True, cam: bool = True) -> dict:
    ws.send_json({"type": "join", "role": role, "mic": mic, "cam": cam})
    return ws.receive_json()


def test_signaling_two_peers_exchange(client):
    token = schedule(client, create_volunteer(client))["token"]
    with client.websocket_connect(f"/calls/{token}/ws") as coord:
        assert join(coord, "coordinator") == {"type": "joined", "you": "coordinator", "peers": []}
        with client.websocket_connect(f"/calls/{token}/ws") as vol:
            joined = join(vol, "volunteer", cam=False)
            assert joined["peers"] == [{"id": "coordinator", "mic": True, "cam": True}]
            assert coord.receive_json() == {
                "type": "peer-joined",
                "id": "volunteer",
                "mic": True,
                "cam": False,
            }

            # волонтёр (пришёл позже) звонит координатору — сигнал доходит с пометкой «от кого»
            vol.send_json(
                {
                    "type": "signal",
                    "to": "coordinator",
                    "data": {"sdp": {"type": "offer", "sdp": "x"}},
                }
            )
            assert coord.receive_json() == {
                "type": "signal",
                "from": "volunteer",
                "data": {"sdp": {"type": "offer", "sdp": "x"}},
            }
            coord.send_text("не json")  # мусор не роняет комнату
            coord.send_json({"type": "state", "mic": False, "cam": True})
            assert vol.receive_json() == {
                "type": "state",
                "id": "coordinator",
                "mic": False,
                "cam": True,
            }

            vol.send_json({"type": "leave"})
        assert coord.receive_json() == {"type": "peer-left", "id": "volunteer"}


def test_signaling_same_role_replaces_previous(client):
    from app.api.calls import rooms

    token = schedule(client, create_volunteer(client))["token"]
    with client.websocket_connect(f"/calls/{token}/ws") as old:
        join(old, "volunteer")
        with client.websocket_connect(f"/calls/{token}/ws") as new:
            assert join(new, "volunteer")["peers"] == []
            assert old.receive_json() == {"type": "replaced"}
            assert set(rooms[token]) == {"volunteer"}
    assert token not in rooms  # все вышли — комнаты нет


@pytest.mark.parametrize("status", ["canceled", "done"])
def test_signaling_rejects_closed_interview(client, status):
    interview = schedule(client, create_volunteer(client))
    client.patch(f"/interviews/{interview['id']}", json={"status": status})
    with client.websocket_connect(f"/calls/{interview['token']}/ws") as ws:
        message = ws.receive_json()
        assert message["type"] == "error"
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()


def test_signaling_unknown_token_and_bad_role(client):
    with client.websocket_connect("/calls/nope/ws") as ws:
        assert "недействительна" in ws.receive_json()["message"]

    token = schedule(client, create_volunteer(client))["token"]
    with client.websocket_connect(f"/calls/{token}/ws") as ws:
        assert join(ws, "admin")["type"] == "error"


RESULT = {
    "motivation": 5,
    "readiness": 4,
    "regularity": 3,
    "decision": "next",
    "roles": ["photographer"],
    "comment": "Снимает на свою камеру, готова по субботам",
}


def test_new_interview_has_no_result(client):
    interview = schedule(client, create_volunteer(client))
    assert interview["result"] is None


def test_result_saved_marks_done_and_can_be_corrected(client):
    volunteer_id = create_volunteer(client)
    interview = schedule(client, volunteer_id)

    r = client.put(f"/interviews/{interview['id']}/result", json=RESULT)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "done"
    assert body["result"]["decision"] == "next"
    assert body["result"]["roles"] == ["photographer"]

    # координатор поправил итог — перезаписываем, а не создаём второй
    r = client.put(
        f"/interviews/{interview['id']}/result", json={**RESULT, "decision": "think", "roles": []}
    )
    assert r.status_code == 200, r.text
    listed = client.get(f"/volunteers/{volunteer_id}/interviews").json()
    assert listed[0]["result"]["decision"] == "think"
    assert listed[0]["result"]["roles"] == []


def test_result_errors(client):
    interview = schedule(client, create_volunteer(client))
    url = f"/interviews/{interview['id']}/result"
    assert client.put("/interviews/999/result", json=RESULT).status_code == 404
    assert client.put(url, json={**RESULT, "motivation": 0}).status_code == 422
    r = client.put(url, json={**RESULT, "roles": ["astronaut"]})
    assert r.status_code == 422
    assert "astronaut" in r.json()["detail"]

    client.patch(f"/interviews/{interview['id']}", json={"status": "canceled"})
    r = client.put(url, json=RESULT)
    assert r.status_code == 409
    assert "отменено" in r.json()["detail"]
