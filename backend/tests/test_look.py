from tests.test_auth import bearer, register


def test_look_defaults_save_and_reload(client):
    token = register(client)["token"]

    r = client.get("/auth/look", headers=bearer(token))
    assert r.status_code == 200
    assert r.json() == {
        "avatar": "",
        "color": "blue",
        "cover": "sky",
        "stickers": [],
        "nickname": "",
    }

    look = {
        "avatar": "🦊",
        "color": "berry",
        "cover": "night",
        "stickers": ["🌻", "🎓"],
        "nickname": " Аня ",
    }
    saved = client.put("/auth/look", json=look, headers=bearer(token))
    assert saved.status_code == 200, saved.text
    assert saved.json()["nickname"] == "Аня"

    again = client.get("/auth/look", headers=bearer(token)).json()
    assert again == {**look, "nickname": "Аня"}


def test_look_needs_login_and_checks_values(client):
    assert client.get("/auth/look").status_code == 401
    assert client.put("/auth/look", json={}).status_code == 401

    token = register(client)["token"]
    too_many = {"stickers": ["🌻", "🌈", "🎨", "🎵"]}
    assert client.put("/auth/look", json=too_many, headers=bearer(token)).status_code == 422
    unknown = {"cover": "rainbow"}
    assert client.put("/auth/look", json=unknown, headers=bearer(token)).status_code == 422


def test_look_is_per_account(client):
    anna = register(client)["token"]
    boris = register(client, email="boris@example.ru")["token"]
    client.put("/auth/look", json={"avatar": "🐻"}, headers=bearer(anna))
    assert client.get("/auth/look", headers=bearer(boris)).json()["avatar"] == ""
