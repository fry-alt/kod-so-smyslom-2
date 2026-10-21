from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    MenuButtonWebApp,
    ReplyKeyboardMarkup,
    WebAppInfo,
)

BTN_CHAT = "💬 Свободный чат"
BTN_DOCS = "📚 Вопрос о фонде"
BTN_APP = "📱 Открыть приложение"
MENU_BUTTON_TEXT = "Приложение"


def _is_https(url: str) -> bool:
    return url.startswith("https://")  # Telegram открывает Mini App только по https


def main_menu(webapp_url: str = "") -> ReplyKeyboardMarkup:
    rows = [[KeyboardButton(text=BTN_DOCS), KeyboardButton(text=BTN_CHAT)]]
    if _is_https(webapp_url):
        rows.append([KeyboardButton(text=BTN_APP, web_app=WebAppInfo(url=webapp_url))])
    return ReplyKeyboardMarkup(keyboard=rows, resize_keyboard=True)


def app_buttons(webapp_url: str) -> InlineKeyboardMarkup | None:
    """Кнопки под приветствием: анкета и приложение. Без https-адреса — None (кнопок нет)."""
    if not _is_https(webapp_url):
        return None
    base = webapp_url.rstrip("/")
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📝 Заполнить анкету", web_app=WebAppInfo(url=f"{base}/form")
                )
            ],
            [InlineKeyboardButton(text=BTN_APP, web_app=WebAppInfo(url=base))],
        ]
    )


def menu_button(webapp_url: str) -> MenuButtonWebApp | None:
    """Кнопка слева от поля ввода — открывает Mini App. Ставится при запуске бота (bot/main.py)."""
    if not _is_https(webapp_url):
        return None
    return MenuButtonWebApp(text=MENU_BUTTON_TEXT, web_app=WebAppInfo(url=webapp_url))
