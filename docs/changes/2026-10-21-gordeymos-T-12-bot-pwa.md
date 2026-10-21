---
date: 2026-10-21
author: gordeymos
task: T-12 (#12)
pr: см. PR по ветке b/T-12-bot-pwa
areas: [интерфейс, деплой]
---

# Бот открывает Mini App сам, сайт ставится на телефон как приложение, ссылки для жюри в README

## Что изменилось
- Бот при запуске сам ставит кнопку меню «Приложение» (Mini App по `WEBAPP_URL`) и команды `/start`, `/help` — в @BotFather ничего настраивать не нужно, достаточно создать бота и положить токен.
- `/start` — приветствие от фонда и кнопки «📝 Заполнить анкету» (сразу `/form`) и «📱 Открыть приложение»; ниже — меню «📚 Вопрос о фонде» и «💬 Свободный чат». Без https-адреса кнопок Mini App нет, бот работает как раньше.
- PWA: `manifest.webmanifest`, иконки 192/512 (+ maskable для Android), `apple-touch-icon`, `theme-color` — сайт ставится «На экран Домой» на iOS и Android.
- README: таблица «Ссылки для жюри» в начале.

## Где в коде
- `bot/keyboards.py` — `app_buttons()`, `menu_button()`; кнопка режима документов переименована в «📚 Вопрос о фонде».
- `bot/main.py` — `setup_bot()`: команды и кнопка меню; ошибка Telegram не роняет бота.
- `bot/handlers/start.py` — новые тексты.
- `miniapp/public/manifest.webmanifest`, `miniapp/public/icons/*`, `miniapp/index.html` — PWA.
- `backend/tests/test_bot_keyboards.py` — кнопки ведут на `/form` и корень, без https их нет.
- Новых зависимостей и переменных нет (`WEBAPP_URL` и `TELEGRAM_BOT_TOKEN` уже были; на проде `WEBAPP_URL` ставит деплой из T-26).

## Как проверить
- `make test` — тесты кнопок; `make lint`, `npm run build` проходят.
- После мержа и выкладки: открыть сайт на телефоне → «На экран Домой» → иконка с сердцем.
- Когда токен бота попадёт в секрет `APP_ENV`: `/start` в боте → «Заполнить анкету» открывает анкету внутри Telegram; слева от поля ввода — кнопка «Приложение».

## Что осталось и на что обратить внимание
- Бота создаёт @gordeymos в @BotFather; токен — строкой `TELEGRAM_BOT_TOKEN=...` в секрет `APP_ENV` (окружение production), его ведёт @fry-alt. После этого — ссылку на бота в README.
- `https://DOMAIN/api/docs` за прокси не работает (Swagger просит `/openapi.json` без `/api`), поэтому в README только `/api/health`.
- Выкладка на сервер — PR #30 (T-26).
