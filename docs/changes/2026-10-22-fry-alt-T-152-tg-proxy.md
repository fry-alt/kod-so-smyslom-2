---
date: 2026-10-22
author: fry-alt
task: T-152 (#152)
pr: см. PR по ветке a/T-152-tg-proxy
areas: [бэкенд, деплой]
---

# Бот и уведомления ходят в Telegram через прокси Yapp — сервер не достаёт до api.telegram.org

## Что изменилось
- Бот @DetiMarii_bot на проде не отвечал на `/start`: сервер в России не достаёт до `api.telegram.org`. Контейнер при этом не падал — бесконечно пытался подключиться, поэтому в деплое всё было «зелёным».
- Новая переменная `TELEGRAM_API_BASE` — адрес прокси до Bot API. Задана — бот и уведомления бэкенда (допуск, обучение, собеседование, сообщения координатора) ходят через неё; пусто — напрямую, как раньше.
- На проде адрес берётся из `.env` Yapp прямо на сервере: у Yapp на том же сервере бот работает через Cloudflare Worker (fry-alt/yapp#125). В GitHub адрес не попадает и в логи не пишется.
- В деплое новый шаг «Лог бота» — последние 30 строк лога бота после выкладки. Бот не отвечает — смотреть туда.

## Где в коде
- `bot/config.py`, `bot/main.py` — `make_session()`: сессия aiogram с `TelegramAPIServer.from_base(TELEGRAM_API_BASE)`.
- `backend/app/config.py` — `telegram_api_base`; `backend/app/services/notify.py` — адрес `sendMessage` от него.
- `deploy/telegram-from-yapp.sh` — дописывает `TELEGRAM_API_BASE` из `/opt/yapp/.env` в `~/deti/.env` (как `turn-from-yapp.sh` и `mail-from-yapp.sh`). Секрет репозитория `TELEGRAM_API_BASE`, если его задать, важнее.
- `.github/workflows/deploy.yml` — секрет `TELEGRAM_API_BASE`, вызов скрипта, шаг «Лог бота». `.env.example` — описание переменной.
- Тесты: `backend/tests/test_telegram_proxy.py`. Новых зависимостей нет.

## Как проверить
- `make test` — бот и уведомление идут через прокси, без него — напрямую.
- После мержа в логе Deploy: в шаге «Образы и данные на сервер» строка «Telegram: через прокси Yapp», в шаге «Лог бота» — «Telegram Bot API — через прокси», «Бот запущен» и нет `TelegramNetworkError`.
- Написать @DetiMarii_bot `/start` — приходит приветствие с кнопками.

## Что осталось и на что обратить внимание
- Прокси Yapp пропускает только `/bot<токен>/<метод>`. Скачивание файлов (`/file/bot…`) через него не проходит — загрузка документов и голосовых через бота работать не будет, пока в Cloudflare не поправят воркер (`deploy/telegram-proxy-worker.js` в Yapp) или не заведут свой.
- Если Yapp когда-нибудь уберёт прокси, бот снова замолчит — тогда задать свой секрет `TELEGRAM_API_BASE` (инструкция — `deploy/telegram-proxy.md` в Yapp).
