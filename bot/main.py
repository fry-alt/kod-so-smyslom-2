"""Telegram-бот (aiogram 3, long polling). Запуск: make dev-bot  (uv run python -m bot.main)"""

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from bot.api_client import BackendClient
from bot.config import BotSettings
from bot.handlers import routers

# тот же формат, что у бэкенда (app/log.py) — бот от бэкенда не зависит
LOG_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
log = logging.getLogger("bot")


async def main() -> None:
    settings = BotSettings()
    logging.basicConfig(level=settings.log_level.upper(), format=LOG_FORMAT, datefmt="%H:%M:%S")

    if not settings.telegram_bot_token:
        log.warning("TELEGRAM_BOT_TOKEN не задан — бот не запущен (остальные сервисы работают)")
        return

    bot = Bot(settings.telegram_bot_token)
    api = BackendClient(settings.backend_url, settings.backend_timeout)
    dp = Dispatcher(storage=MemoryStorage())  # состояния в памяти: после рестарта режим сбросится
    # всё, что положено в dp[...], aiogram передаёт в хэндлеры по имени аргумента (api, settings)
    dp["api"] = api
    dp["settings"] = settings
    dp.include_routers(*routers)

    log.info("Бот запущен, бэкенд: %s", settings.backend_url)
    try:
        await dp.start_polling(bot)
    finally:
        await api.close()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
