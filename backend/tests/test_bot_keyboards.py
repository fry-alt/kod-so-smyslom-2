"""Кнопки бота: Mini App открывается только по https, анкета — по адресу /form."""

from bot.keyboards import app_buttons, main_menu, menu_button

URL = "https://deti.example.org"


def test_app_buttons_open_form_and_app():
    kb = app_buttons(URL + "/")
    urls = [row[0].web_app.url for row in kb.inline_keyboard]
    assert urls == [URL + "/form", URL]


def test_menu_button_points_to_mini_app():
    assert menu_button(URL).web_app.url == URL


def test_no_mini_app_without_https():
    for url in ["", "http://localhost:5173"]:
        assert app_buttons(url) is None
        assert menu_button(url) is None
        assert len(main_menu(url).keyboard) == 1  # только режимы вопросов, без кнопки приложения
