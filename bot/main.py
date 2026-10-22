"""Telegram-бот (aiogram 3, long polling). Запуск: make dev-bot  (uv run python -m bot.main)"""

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.telegram import TelegramAPIServer
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import BotCommand

from bot.api_client import BackendClient
from bot.config import BotSettings
from bot.handlers import routers
from bot.keyboards import menu_button

# тот же формат, что у бэкенда (app/log.py) — бот от бэкенда не зависит
LOG_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
log = logging.getLogger("bot")


async def main() -> None:
    settings = BotSettings()
    logging.basicConfig(level=settings.log_level.upper(), format=LOG_FORMAT, datefmt="%H:%M:%S")

    if not settings.telegram_bot_token:
        log.warning("TELEGRAM_BOT_TOKEN не задан — бот не запущен (остальные сервисы работают)")
        return

    bot = Bot(settings.telegram_bot_token, session=make_session(settings.telegram_api_base))
    api = BackendClient(settings.backend_url, settings.backend_timeout, settings.service_key)
    dp = Dispatcher(storage=MemoryStorage())  # состояния в памяти: после рестарта режим сбросится
    # всё, что положено в dp[...], aiogram передаёт в хэндлеры по имени аргумента (api, settings)
    dp["api"] = api
    dp["settings"] = settings
    dp.include_routers(*routers)

    await setup_bot(bot, settings)
    log.info("Бот запущен, бэкенд: %s", settings.backend_url)
    try:
        await dp.start_polling(bot)
    finally:
        await api.close()
        await bot.session.close()


def make_session(api_base: str) -> AiohttpSession:
    """Сервер в России может не доставать до api.telegram.org — тогда ходим через прокси (TELEGRAM_API_BASE).
    Прокси Yapp пропускает только команды /bot<токен>/<метод>: скачать файл (документ, голосовое) через него нельзя."""
    if not api_base:
        return AiohttpSession()
    # адрес прокси не пишем: лог деплоя публичный
    log.info("Telegram Bot API — через прокси TELEGRAM_API_BASE")
    return AiohttpSession(api=TelegramAPIServer.from_base(api_base))


async def setup_bot(bot: Bot, settings: BotSettings) -> None:
    """Команды и кнопка меню «Приложение» — чтобы не настраивать их руками в @BotFather."""
    try:
        await bot.set_my_commands(
            [
                BotCommand(command="start", description="Начать: анкета и приложение"),
                BotCommand(command="help", description="Что умеет бот"),
            ]
        )
        button = menu_button(settings.webapp_url)
        if button:
            await bot.set_chat_menu_button(menu_button=button)
            log.info("Кнопка меню ведёт в Mini App: %s", settings.webapp_url)
        else:
            log.warning("WEBAPP_URL не https — кнопки Mini App не будет")
    except Exception:  # бот должен работать, даже если Telegram не принял настройку
        log.exception("Не удалось настроить команды и кнопку меню")


if __name__ == "__main__":
    asyncio.run(main())
