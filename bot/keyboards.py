from aiogram.types import KeyboardButton, ReplyKeyboardMarkup, WebAppInfo

BTN_CHAT = "💬 Свободный чат"
BTN_DOCS = "📚 Вопрос по документам"
BTN_APP = "📱 Открыть приложение"


def main_menu(webapp_url: str = "") -> ReplyKeyboardMarkup:
    rows = [[KeyboardButton(text=BTN_CHAT), KeyboardButton(text=BTN_DOCS)]]
    if webapp_url.startswith("https://"):  # Telegram открывает Mini App только по https
        rows.append([KeyboardButton(text=BTN_APP, web_app=WebAppInfo(url=webapp_url))])
    return ReplyKeyboardMarkup(keyboard=rows, resize_keyboard=True)
