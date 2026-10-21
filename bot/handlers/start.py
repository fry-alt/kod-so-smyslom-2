from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from bot.config import BotSettings
from bot.handlers.states import Mode
from bot.keyboards import app_buttons, main_menu

router = Router(name="start")

WELCOME = (
    "Это бот волонтёров фонда «Дети Марии». Фонд больше 30 лет помогает детям-сиротам, "
    "выпускникам детских домов и людям с ментальными особенностями — через творческие мастерские "
    "и сопровождение.\n\n"
    "Хотите помогать? Заполните короткую анкету — координатор подберёт, где ваша помощь нужнее всего."
)

HELP = (
    "Что я умею:\n"
    "• «📝 Заполнить анкету» и «📱 Открыть приложение» — анкета, обучение, ваш статус и куда можно пойти;\n"
    "• «📚 Вопрос о фонде» — отвечу по документам фонда;\n"
    "• «💬 Свободный чат» — просто поговорить."
)


@router.message(CommandStart())
async def start(message: Message, state: FSMContext, settings: BotSettings) -> None:
    await state.set_state(Mode.docs)
    name = message.from_user.first_name if message.from_user else ""
    buttons = app_buttons(settings.webapp_url)
    await message.answer(
        f"Здравствуйте{', ' + name if name else ''}!\n\n{WELCOME}",
        reply_markup=buttons or main_menu(settings.webapp_url),
    )
    if buttons:  # inline-кнопки и нижнее меню нельзя прислать одним сообщением
        await message.answer(HELP, reply_markup=main_menu(settings.webapp_url))


@router.message(Command("help"))
async def help_(message: Message, settings: BotSettings) -> None:
    await message.answer(HELP, reply_markup=app_buttons(settings.webapp_url))
