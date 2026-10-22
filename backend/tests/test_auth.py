from tests.test_volunteers import FORM

from app.config import get_settings
from app.services import mail
from app.services.accounts import check_password, hash_password


def register(client, **changes) -> dict:
    """Регистрация в два шага: форма → код из письма → аккаунт."""
    body = {"name": "Анна", "email": "Anna@Example.ru", "password": "secret1", "role": "volunteer", **changes}
    letters: list[str] = []
    mail.set_mailer(lambda to, subject, text, html: letters.append(subject))
    r = client.post("/auth/register", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["pending"] is True
    code = letters[-1].split()[0]
    r = client.post("/auth/register/verify", json={"email": body["email"], "code": code})
    assert r.status_code == 200, r.text
    return r.json()


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_password_is_stored_as_hash():
    stored = hash_password("secret1")
    assert "secret1" not in stored
    assert check_password("secret1", stored)
    assert not check_password("secret2", stored)


def test_register_login_and_me(client):
    auth = register(client)
    assert auth["account"] == {
        "id": 1,
        "name": "Анна",
        "email": "anna@example.ru",
        "role": "volunteer",
        "volunteer_id": None,
    }

    r = client.post(
        "/auth/login",
        json={"email": " ANNA@example.ru", "password": "secret1", "role": "volunteer"},
    )
    assert r.status_code == 200
    assert r.json()["token"] == auth["token"]

    me = client.get("/auth/me", headers=bearer(auth["token"]))
    assert me.json()["email"] == "anna@example.ru"
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers=bearer("not-a-token")).status_code == 401


def test_wrong_password_duplicate_email_and_role_is_derived_from_account(client):
    register(client)
    again = {"name": "Анна", "email": "anna@example.ru", "password": "secret1"}
    assert client.post("/auth/register", json=again).status_code == 400

    bad = client.post(
        "/auth/login", json={"email": "anna@example.ru", "password": "nope", "role": "volunteer"}
    )
    assert bad.status_code == 401
    assert "Неверная почта или пароль" in bad.json()["detail"]

    role = client.post(
        "/auth/login",
        json={"email": "anna@example.ru", "password": "secret1", "role": "coordinator"},
    )
    assert role.status_code == 200
    assert role.json()["account"]["role"] == "volunteer"


def test_validates_email_and_password(client):
    no_name = {"name": "  ", "email": "a@b.ru", "password": "secret1"}
    assert client.post("/auth/register", json=no_name).status_code == 400
    not_email = {"email": "не почта", "password": "secret1"}
    assert client.post("/auth/register", json=not_email).status_code == 422
    short = {"email": "a@b.ru", "password": "123"}
    assert client.post("/auth/register", json=short).status_code == 422


def test_coordinator_code_defaults_to_1111(client):
    no_code = {"name": "Анна", "email": "c@fund.ru", "password": "secret1", "role": "coordinator"}
    assert client.post("/auth/register", json=no_code).status_code == 400
    auth = register(client, email="c@fund.ru", role="coordinator", code="1111")
    assert auth["account"]["role"] == "coordinator"
    # волонтёру код не нужен
    register(client, email="v@mail.ru")


def test_coordinator_code_from_env(client, monkeypatch):
    monkeypatch.setenv("COORDINATOR_CODE", "deti")
    get_settings.cache_clear()
    wrong = {"name": "Анна", "email": "c@fund.ru", "password": "secret1", "role": "coordinator", "code": "1111"}
    assert client.post("/auth/register", json=wrong).status_code == 400
    register(client, email="c@fund.ru", role="coordinator", code="deti")


def test_coordinator_changes_fund_code(client):
    coord = bearer(register(client, email="c@fund.ru", role="coordinator", code="1111")["token"])
    assert client.get("/auth/fund-code", headers=coord).json() == {"code": "1111"}
    r = client.put("/auth/fund-code", json={"code": " deti2026 "}, headers=coord)
    assert r.status_code == 200, r.text
    assert client.get("/auth/fund-code", headers=coord).json() == {"code": "deti2026"}
    # старый код больше не подходит, новый — подходит
    old = {"name": "Анна", "email": "c2@fund.ru", "password": "secret1", "role": "coordinator", "code": "1111"}
    assert client.post("/auth/register", json=old).status_code == 400
    register(client, email="c2@fund.ru", role="coordinator", code="deti2026")
    # слишком короткий код не сохраняем
    assert client.put("/auth/fund-code", json={"code": "12"}, headers=coord).status_code == 422


def test_fund_code_only_for_coordinator(client):
    assert client.get("/auth/fund-code").status_code == 401
    volunteer = bearer(register(client)["token"])
    assert client.get("/auth/fund-code", headers=volunteer).status_code == 403
    assert (
        client.put("/auth/fund-code", json={"code": "0000"}, headers=volunteer).status_code == 403
    )


def test_questionnaire_links_to_account(client):
    auth = register(client)
    v = client.post("/volunteers", json=FORM, headers=bearer(auth["token"])).json()
    me = client.get("/auth/me", headers=bearer(auth["token"])).json()
    assert me["volunteer_id"] == v["id"]
    # вторая анкета первую не перезаписывает, анкета без входа ни к кому не привязывается
    client.post("/volunteers", json=FORM, headers=bearer(auth["token"]))
    client.post("/volunteers", json=FORM)
    assert client.get("/auth/me", headers=bearer(auth["token"])).json()["volunteer_id"] == v["id"]


def test_coordinator_questionnaire_is_not_linked(client):
    auth = register(client, email="c@fund.ru", role="coordinator", code="1111")
    client.post("/volunteers", json=FORM, headers=bearer(auth["token"]))
    assert client.get("/auth/me", headers=bearer(auth["token"])).json()["volunteer_id"] is None
