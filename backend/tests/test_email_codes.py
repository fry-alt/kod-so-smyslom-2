"""Код подтверждения почты при регистрации (services/email_codes.py, services/mail.py)."""

from datetime import UTC, datetime

import pytest
from sqlmodel import Session

from app.config import get_settings
from app.db import get_engine
from app.schemas import RegisterIn
from app.services import accounts, email_codes, mail

FORM = {"email": "anna@example.ru", "password": "secret1", "role": "volunteer"}


def code_of(letter: dict) -> str:
    return letter["subject"].split()[0]


@pytest.fixture
def session(client):  # client — чтобы бэкенд создал таблицы
    with Session(get_engine()) as s:
        yield s


def start(session, now=1000.0, **changes):
    payload = accounts.prepare(session, RegisterIn(**{**FORM, **changes}))
    return email_codes.start_signup(session, payload, now=now)


def test_account_appears_only_after_right_code(client, mailbox):
    r = client.post("/auth/register", json={**FORM, "email": "Anna@Example.ru"})
    assert r.json() == {"pending": True, "email": "anna@example.ru", "resend_after": 60}
    assert mailbox[-1]["to"] == "anna@example.ru"
    code = code_of(mailbox[-1])
    assert len(code) == 6 and code in mailbox[-1]["text"]
    # до кода войти нельзя
    login = {"email": "anna@example.ru", "password": "secret1", "role": "volunteer"}
    assert client.post("/auth/login", json=login).status_code == 401

    wrong = client.post(
        "/auth/register/verify", json={"email": "anna@example.ru", "code": "000000"}
    )
    assert wrong.status_code == 400 and "Осталось попыток: 4" in wrong.json()["detail"]
    ok = client.post("/auth/register/verify", json={"email": "ANNA@example.ru", "code": code})
    assert ok.status_code == 200 and ok.json()["account"]["email"] == "anna@example.ru"
    assert client.post("/auth/login", json=login).status_code == 200
    # код одноразовый
    again = client.post("/auth/register/verify", json={"email": "anna@example.ru", "code": code})
    assert again.status_code == 400


def test_form_errors_before_letter(client, mailbox):
    no_code = {**FORM, "role": "coordinator"}
    assert client.post("/auth/register", json=no_code).status_code == 400
    assert mailbox == []


def test_five_attempts(session, mailbox):
    start(session)
    for _ in range(email_codes.MAX_ATTEMPTS):
        with pytest.raises(email_codes.CodeError):
            email_codes.finish_signup(session, FORM["email"], "000000", now=1001)
    # попытки кончились — не подходит даже верный код
    with pytest.raises(email_codes.CodeError) as e:
        email_codes.finish_signup(session, FORM["email"], code_of(mailbox[-1]), now=1002)
    assert e.value.status == 429


def test_code_expires_after_15_minutes(session, mailbox):
    start(session)
    with pytest.raises(email_codes.CodeError, match="устарел"):
        email_codes.finish_signup(
            session, FORM["email"], code_of(mailbox[-1]), now=1000 + 15 * 60 + 1
        )


def test_resend_not_earlier_than_a_minute_and_old_codes_still_work(session, mailbox):
    start(session, now=1000)
    with pytest.raises(email_codes.CodeError) as e:
        email_codes.resend_signup(session, FORM["email"], now=1030)
    assert e.value.status == 429 and "через 31 с" in str(e.value)
    for i in range(1, 4):
        email_codes.resend_signup(session, FORM["email"], now=1000 + 61 * i)
    codes = [code_of(m) for m in mailbox]
    assert len(codes) == 4
    # действуют три последних кода; самый первый — уже нет (если не совпал случайно)
    if codes[0] not in codes[1:]:
        with pytest.raises(email_codes.CodeError):
            email_codes.finish_signup(session, FORM["email"], codes[0], now=1300)
    out = email_codes.finish_signup(session, FORM["email"], codes[1], now=1300)
    assert out.account.email == FORM["email"]


def test_resend_without_request(session):
    with pytest.raises(email_codes.CodeError, match="заполните форму"):
        email_codes.resend_signup(session, "nobody@mail.ru")


def test_failed_letter_lets_try_again_at_once(session, mailbox):
    def broken(to, subject, text, html):
        raise mail.MailError("Postbox недоступен")

    mail.set_mailer(broken)
    with pytest.raises(email_codes.CodeError) as e:
        start(session, now=1000)
    assert e.value.status == 502
    mail.set_mailer(lambda to, subject, text, html: mailbox.append({"subject": subject}))
    start(session, now=1001)  # без «подождите минуту»
    assert len(mailbox) == 1


def test_letters_limit_per_ip(client, mailbox):
    for i in range(10):
        r = client.post("/auth/register", json={**FORM, "email": f"a{i}@mail.ru"})
        assert r.status_code == 200
    r = client.post("/auth/register", json={**FORM, "email": "a10@mail.ru"})
    assert r.status_code == 429


def test_without_mail_on_prod_registers_at_once(client, monkeypatch):
    mail.set_mailer(None)
    monkeypatch.setenv("MAIL_LOG_CODES", "false")
    get_settings.cache_clear()
    r = client.post("/auth/register", json=FORM)
    assert r.status_code == 200 and r.json()["account"]["email"] == FORM["email"]


def test_locally_code_goes_to_log(client, caplog):
    mail.set_mailer(None)
    r = client.post("/auth/register", json=FORM)
    assert r.json()["pending"] is True
    assert "код подтверждения почты" in caplog.text


def test_password_is_not_stored_in_request(session):
    start(session)
    row = session.get(email_codes.EmailCode, FORM["email"])
    assert "secret1" not in str(row.payload)
    assert accounts.check_password("secret1", row.payload["password_hash"])


def test_sigv4_signature():
    # пример подписи сверен с реализацией Yapp (server/sigv4.js) на тех же входных данных
    headers = mail.sign_request(
        b'{"a":1}', "KEYID", "SECRET", now=datetime(2026, 10, 1, 12, 0, 0, tzinfo=UTC)
    )
    assert headers["X-Amz-Date"] == "20261001T120000Z"
    assert headers["Authorization"] == (
        "AWS4-HMAC-SHA256 Credential=KEYID/20261001/ru-central1/ses/aws4_request, "
        "SignedHeaders=content-type;host;x-amz-date, "
        "Signature=65957bf62ea40d14263c089ca0a11061a3ac416d17ad19a25f510d39c8aa705c"
    )


def test_sender_name_is_encoded():
    assert mail.sender("Дети Марии <noreply@yyaapp.ru>") == (
        "=?utf-8?b?0JTQtdGC0Lgg0JzQsNGA0LjQuA==?= <noreply@yyaapp.ru>"
    )
    assert mail.sender("noreply@yyaapp.ru") == "noreply@yyaapp.ru"


def test_postbox_request(monkeypatch):
    """С ключом письмо уходит в Postbox подписанным запросом; ошибка Postbox — MailError."""
    import httpx

    monkeypatch.setenv("POSTBOX_KEY_ID", "KEYID")
    monkeypatch.setenv("POSTBOX_SECRET", "SECRET")
    monkeypatch.setenv("MAIL_FROM", "Дети Марии <noreply@yyaapp.ru>")
    get_settings.cache_clear()
    mail.set_mailer(None)
    calls = []

    def post(url, content, headers, timeout):
        calls.append((url, content, headers))
        return httpx.Response(200 if len(calls) == 1 else 400, text="bad")

    monkeypatch.setattr("app.services.mail.httpx.post", post)
    mail.send("anna@example.ru", "Тема", "текст", "<p>текст</p>")
    url, content, headers = calls[0]
    assert url == "https://postbox.cloud.yandex.net/v2/email/outbound-emails"
    assert headers["Authorization"].startswith("AWS4-HMAC-SHA256 Credential=KEYID/")
    assert '"ToAddresses": ["anna@example.ru"]' in content.decode()
    with pytest.raises(mail.MailError, match="HTTP 400"):
        mail.send("anna@example.ru", "Тема", "текст", "<p>текст</p>")
