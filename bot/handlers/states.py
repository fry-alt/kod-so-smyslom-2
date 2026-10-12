from aiogram.fsm.state import State, StatesGroup


class Mode(StatesGroup):
    chat = State()  # свободный диалог с LLM
    docs = State()  # вопросы по загруженным документам (RAG)
