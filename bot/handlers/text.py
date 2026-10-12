"""Текстовые сообщения: переключение режима и вопрос к бэкенду."""

from aiogram import F, Router
from aiogram.enums import ChatAction
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from bot.api_client import BackendClient, BackendError
from bot.handlers.states import Mode
from bot.keyboards import BTN_CHAT, BTN_DOCS

router = Router(name="text")

HISTORY_LIMIT = 10  # сколько последних реплик чата помним


@router.message(F.text == BTN_CHAT)
async def to_chat(message: Message, state: FSMContext) -> None:
    await state.set_state(Mode.chat)
    await state.update_data(history=[])
    await message.answer("Режим свободного чата. Спрашивайте что угодно.")


@router.message(F.text == BTN_DOCS)
async def to_docs(message: Message, state: FSMContext) -> None:
    await state.set_state(Mode.docs)
    await message.answer("Режим вопросов по документам. Отвечу только по загруженным данным.")


@router.message(Mode.chat, F.text)
async def chat(message: Message, state: FSMContext, api: BackendClient) -> None:
    await message.bot.send_chat_action(message.chat.id, ChatAction.TYPING)
    history = (await state.get_data()).get("history", [])
    try:
        answer = await api.chat(message.text, _user_id(message), history)
    except BackendError as e:
        await message.answer(str(e))
        return
    history += [
        {"role": "user", "content": message.text},
        {"role": "assistant", "content": answer},
    ]
    await state.update_data(history=history[-HISTORY_LIMIT:])
    await message.answer(answer)


@router.message(F.text)  # режим docs и режим «не выбран» (например, после перезапуска бота)
async def ask(message: Message, api: BackendClient) -> None:
    await message.bot.send_chat_action(message.chat.id, ChatAction.TYPING)
    try:
        result = await api.ask(message.text, _user_id(message))
    except BackendError as e:
        await message.answer(str(e))
        return
    text = result["answer"]
    if result["sources"]:
        files = sorted({s["source"] for s in result["sources"]})
        text += "\n\nИсточники: " + ", ".join(files)
    await message.answer(text)


def _user_id(message: Message) -> str:
    return f"tg:{message.from_user.id}"
