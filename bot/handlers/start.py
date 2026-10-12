from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from bot.config import BotSettings
from bot.handlers.states import Mode
from bot.keyboards import main_menu

router = Router(name="start")

HELP = (
    "Я помощник фонда. Что умею:\n"
    "• отвечать на вопросы по документам организации (режим «📚»);\n"
    "• просто разговаривать (режим «💬»);\n"
    "• принимать документы — пришлите PDF, DOCX, XLSX, CSV, TXT или MD, и я добавлю их в базу знаний."
)


@router.message(CommandStart())
async def start(message: Message, state: FSMContext, settings: BotSettings) -> None:
    await state.set_state(Mode.docs)
    await message.answer(
        f"Здравствуйте, {message.from_user.first_name}!\n\n{HELP}",
        reply_markup=main_menu(settings.webapp_url),
    )


@router.message(Command("help"))
async def help_(message: Message) -> None:
    await message.answer(HELP)
