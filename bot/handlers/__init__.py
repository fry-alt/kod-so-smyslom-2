"""Роутеры бота. Порядок важен: текстовый хэндлер ловит всё, поэтому он последний."""

from bot.handlers import document, start, text, voice

routers = [start.router, document.router, voice.router, text.router]
