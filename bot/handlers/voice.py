"""Голосовые сообщения. Пока заглушка: распознавание речи (STT) не подключено.

TODO(кейс, если нужен голос):
1. Скачать файл: data = await message.bot.download(message.voice)  (формат OGG/Opus).
2. Добавить в бэкенд эндпоинт POST /stt, который отправляет аудио в STT:
   - Yandex SpeechKit (короткие аудио до 30 с, синхронный API), или
   - OpenAI-совместимый /v1/audio/transcriptions (Whisper) через тот же OpenAI SDK.
3. Распознанный текст отправить дальше как обычный вопрос: api.ask(text, ...).
"""

from aiogram import F, Router
from aiogram.types import Message

router = Router(name="voice")


@router.message(F.voice | F.audio)
async def voice(message: Message) -> None:
    await message.answer("Голосовые сообщения пока не распознаю — напишите, пожалуйста, текстом.")
