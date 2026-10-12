"""Пользователь прислал файл → отправляем его в бэкенд на индексацию."""

from aiogram import F, Router
from aiogram.types import Message

from bot.api_client import BackendClient, BackendError

router = Router(name="document")

MAX_FILE_MB = 20  # больше Telegram Bot API скачать не даст


@router.message(F.document)
async def document(message: Message, api: BackendClient) -> None:
    doc = message.document
    if doc.file_size and doc.file_size > MAX_FILE_MB * 1024 * 1024:
        await message.answer(f"Файл больше {MAX_FILE_MB} МБ — пришлите поменьше.")
        return
    await message.answer(f"Загружаю «{doc.file_name}»…")
    data = await message.bot.download(doc)
    try:
        result = await api.upload(doc.file_name or "document.txt", data.read())
    except BackendError as e:
        await message.answer(str(e))
        return
    await message.answer(
        f"Готово: «{result['filename']}» добавлен в базу знаний ({result['chunks']} фрагм.). "
        "Теперь можно задавать вопросы по нему."
    )
