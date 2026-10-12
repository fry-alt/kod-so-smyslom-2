---
description: Создать хэндлер или FSM-сценарий бота, который вызывает указанный эндпоинт
argument-hint: <сценарий — шаги диалога и какой эндпоинт вызвать>
---

Создай сценарий Telegram-бота (aiogram 3): $ARGUMENTS

Правила:
- Бот ходит только в наш бэкенд через `bot/api_client.py` (`BackendClient`). Если нужного метода нет — добавь его туда (через `_post`, ошибки — `BackendError`). В LLM напрямую не ходим.
- Новый файл `bot/handlers/<имя>.py` со своим `Router(name=...)`. Подключи его в `bot/handlers/__init__.py` **перед** `text.router` (он ловит любой текст).
- Многошаговый диалог — через FSM: `StatesGroup` в `bot/handlers/states.py`, данные шагов — `state.update_data(...)`. На каждом шаге понятный вопрос и кнопка/команда «Отмена».
- Кнопки — в `bot/keyboards.py`. Тексты — на русском, коротко, без markdown-разметки (parse_mode не используем).
- Клиент `api: BackendClient` и `settings: BotSettings` приходят в хэндлер по имени аргумента (см. `bot/main.py`).
- Перед долгим запросом — `send_chat_action(..., ChatAction.TYPING)`.
- Если эндпоинта на бэкенде ещё нет — сначала предложи выполнить `/new-endpoint`.

В конце: `make lint`, `make test`, и коротко опиши, как проверить сценарий руками в Telegram.
