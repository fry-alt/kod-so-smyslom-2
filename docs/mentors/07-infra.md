# Бот, Docker, деплой, CI, скрипты

## 1. Telegram-бот — `bot/`

aiogram 3, long polling. Бот **ходит только в наш бэкенд по HTTP** (`bot/api_client.py`) и никогда не обращается к LLM напрямую.

| Файл | Что делает |
|---|---|
| `main.py` | старт: без `TELEGRAM_BOT_TOKEN` штатно завершается (остальные сервисы работают). Сам ставит команды `/start`, `/help` и кнопку меню «Приложение» → Mini App (`WEBAPP_URL`), без ручной настройки в BotFather. Через `TELEGRAM_API_BASE` работает по прокси, если сервер не достаёт до api.telegram.org |
| `handlers/start.py` | `/start`: приветствие от фонда, кнопки «Заполнить анкету» и «Открыть приложение» (открывают Mini App), нижнее меню |
| `handlers/text.py` | два режима (FSM в памяти): «📚 Вопрос о фонде» → `POST /documents/ask` с источниками; «💬 Свободный чат» → `POST /chat` с историей из 10 реплик |
| `handlers/document.py` | присланный файл (до 20 МБ) → `POST /documents/upload` в базу знаний (из шаблона хакатона; см. ограничение в [06-security.md](06-security.md#5-известные-ограничения-честно)) |
| `handlers/voice.py` | заглушка: «голосовые пока не распознаю — напишите текстом» |
| `api_client.py` | `httpx.AsyncClient` с таймаутом и служебным ключом; ошибки → понятный текст пользователю |
| `keyboards.py` | кнопки; Mini App — только по https-адресу |

Уведомления волонтёру (обучение пройдено, допуск, ссылка на собеседование, новое сообщение) отправляет **бэкенд**
напрямую через Bot API (`services/notify.py`), а не процесс бота.

## 2. Docker

| Файл | Что внутри |
|---|---|
| `docker/python.Dockerfile` | один образ на backend, bot и web: Python 3.12-slim + uv, зависимости отдельным слоем (кешируется, пока не меняется `uv.lock`) |
| `miniapp/Dockerfile` | двухэтапная сборка: Node 24 собирает `dist/`, затем Caddy 2 отдаёт статику и проксирует `/api` |
| `miniapp/Caddyfile` | `/api/*` → бэкенд (WebSocket звонка тоже), остальное → SPA с `try_files … /index.html`; файлы сборки с хешем кешируются на год |
| `docker-compose.yml` | локально: `backend` (:8000, healthcheck `/health`, volume `./data`), `bot`, `web` (:8501), `miniapp` (:8080); профили `gigachat` (прокси gpt2giga), `prod` (Caddy с HTTPS на своём домене), `tunnel` (cloudflared) |
| `deploy/docker-compose.prod.yml` | прод: те же сервисы с лимитами памяти (сервер общий с нашим проектом Yapp), без портов наружу — трафик идёт через Caddy Yapp по общей docker-сети |

## 3. Деплой — `.github/workflows/deploy.yml`

**Каждый мерж в `main` выкладывается сам.** Изменения только в `docs/` и `*.md` выкладку не запускают.

1. Собрать `deploy/.env` из переменных и секретов репозитория. Пустые не попадают. Плюс принудительно:
   `MAIL_LOG_CODES=false`, `API_DOCS=false`, новый случайный `SERVICE_KEY` на каждую выкладку.
2. Собрать оба образа **на машине GitHub** (на сервере с 1 ядром первая сборка шла больше 25 минут), с кешем GHA.
3. Почистить диск сервера (он общий, 14 ГБ), `docker save | gzip | ssh … docker load`.
4. Залить `data/` из репозитория (роли, учебные тексты, демо-документы). База и индекс на сервере не трогаются.
5. Взять секреты TURN, Postbox и прокси Telegram из `.env` Yapp прямо на сервере (`deploy/*-from-yapp.sh`):
   они не проходят через GitHub.
6. `docker compose up -d`, подключить сайт к Caddy Yapp (`deploy/deti.caddy`). Если конфиг не принят,
   файл удаляется, и Yapp не страдает.
7. Проверка: `https://<домен>/api/health` в течение 2,5 минут, иначе в лог выводятся `docker compose ps` и логи.

Перевыложить вручную: `make deploy` (`gh workflow run deploy.yml --ref main`).
Домен — `deti.<ip>.sslip.io`: бесплатный DNS по IP, HTTPS-сертификат Caddy получает сам.

## 4. CI — `.github/workflows/ci.yml`

На каждый PR и пуш в `main`:
- **заметка в `docs/changes/`** — PR без новой заметки не проходит (так напарник видит, кто что поменял);
- в истории коммитов нет AI-атрибуции (то же проверяет git-хук `.githooks/commit-msg`);
- `ruff check`, `ruff format --check`, `pytest` на `fake`;
- **smoke-тест на живом бэкенде**: uvicorn в фоне → `scripts/smoke_test.sh`;
- фронт: `npm ci` + `npm run build` (typecheck + сборка).

`android.yml`: при изменениях в `miniapp/` собирает APK через Capacitor (JDK 21) и кладёт в Artifacts.

## 5. Скрипты — `scripts/`

Все ходят в API бэкенда по HTTP (бэкенд должен работать), без импорта его кода.

| Скрипт | Команда | Что делает |
|---|---|---|
| `seed.py` | `make seed` | 40 анкет → 8 возможностей → история для дашбордов (`history.json`: статусы, прошедшие занятия с участием, отклики, собеседования с итогами). Только в пустую базу; `--force`, `--resume` (дозагрузить после обрыва). Повторяет запрос при обрыве TLS-соединения |
| `ingest.sh` | `make ingest` | загрузить файлы папок через `POST /documents/upload` |
| `smoke_test.sh` | `make smoke` | `/health` → `/chat` → загрузить документ → вопрос по нему → источник найден → удалить документ |
| `benchmark.py` | `make benchmark` | hit@3, «нашли из ждали», время и доля фолбэков по 10 эталонным запросам; `--repeat N` — стабилен ли топ |
| `rag_check.py` | `uv run python scripts/rag_check.py` | 10 типовых вопросов: есть ответ → `found` и нужный источник; нет → честное «не знаю» |
| `chat_check.py` | `uv run python scripts/chat_check.py` | помощник на реальной модели: вопросы новичка, уточнения, вопросы без ответа, не по теме, попытки взлома |

Для прода: `BACKEND_URL=https://deti.201-34-157-90.sslip.io/api SERVICE_KEY=… uv run python scripts/benchmark.py`.

## 6. Streamlit — `web/`

Демо из стартового шаблона хакатона: чат, загрузка документов и вопросы по ним. К кейсу напрямую не относится,
оставлено как удобная «панель» для проверки RAG. Локально `make dev-web` (:8501), на проде `/demo`.

## 7. Данные — `data/`

| Файл | Что это |
|---|---|
| `roles.json` | 21 роль фонда: код, название, описание, навыки, время, регионы, формат, разово или постоянно |
| `training/0N-*.md` | учебные модули (шапка `title`, `required`); `*.quiz.json` — готовые тесты на случай, если LLM недоступен |
| `demo/volunteers.json` | 40 вымышленных анкет: четыре региона, студенты, пенсионеры, удалёнщики, школьники |
| `demo/opportunities.json`, `history.json` | будущие занятия и история для дашбордов |
| `demo/search_benchmark.json` | 10 эталонных запросов с правильными кандидатами и причиной |
| `demo/rag_questions.json` | вопросы для `rag_check.py` |
| `demo/*.md, .docx, .xlsx, .csv, .txt` | документы фонда для помощника (вымышленные, но по мотивам материалов фонда) |

`data/app.db` (SQLite), `data/chroma/` (векторы) и `data/uploads/` создаются при работе и в git не попадают.

## 8. Как мы работали вдвоём

Задачи — GitHub Issues с номером `T-NN`, ветка на задачу (`a/…` или `b/…`), PR с `Closes #N` и заметкой
в `docs/changes/`, зелёный CI, squash-мерж. Граница зон — контракт API (`schemas.py` ↔ `api.ts`): пока эндпоинта
не было, интерфейс работал на моках. Подробно — [WORKFLOW.md](../WORKFLOW.md), история изменений — [changes/](../changes/).
