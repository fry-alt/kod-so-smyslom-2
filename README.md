# Код со смыслом 2 — стартовый шаблон

Шаблон к хакатону ВШЭ «Код со смыслом 2»: **данные НКО → LLM → интерфейс → ссылка для жюри**.
Логики конкретного кейса здесь нет. Есть всё вокруг неё: API, RAG по документам, слой LLM с выбором
провайдера, Telegram-бот, Mini App, Streamlit-демо, Docker и деплой с HTTPS.

Без единого ключа всё работает на провайдере `fake`.

## Ссылки для жюри — кейс «Дети Марии»

| Что | Где |
|---|---|
| Сайт и Telegram Mini App волонтёра (анкета, обучение, статус) | https://deti.201-34-157-90.sslip.io |
| Кабинет фонда: умный поиск, база волонтёров, возможности | https://deti.201-34-157-90.sslip.io/admin |
| Telegram-бот (кнопка «Приложение» открывает Mini App) | [@DetiMarii_bot](https://t.me/DetiMarii_bot) |
| Проверка, что бэкенд жив (провайдер LLM, сколько документов) | https://deti.201-34-157-90.sslip.io/api/health |

Сайт ставится на телефон как приложение: «Поделиться → На экран Домой» (iOS) или «Установить приложение» (Android).
Все данные в демо вымышленные.

### Android-приложение (APK)

То же приложение волонтёра, собранное в APK через [Capacitor](https://capacitorjs.com): ходит в тот же бэкенд, что и сайт.

1. Скачать: [Actions → Android APK](https://github.com/fry-alt/kod-so-smyslom-2/actions/workflows/android.yml) →
   последний зелёный запуск → внизу **Artifacts → deti-marii-apk** (zip с `app-debug.apk`; нужен вход в GitHub).
2. На телефоне открыть `app-debug.apk` и разрешить установку из этого источника.

Собрать самому: `cd miniapp && npm run build:android`, затем открыть папку `miniapp/android` в Android Studio
(или `./gradlew assembleDebug`, нужны JDK 21 и Android SDK). Адрес бэкенда — `PROD_API` в `miniapp/vite.config.ts`.
iOS-версию можно собрать так же (`npx cap add ios`), но для этого нужен Mac с Xcode.

## Запуск за 3 команды

```bash
make setup     # uv + npm зависимости, .env из .env.example, git-хуки
make up        # Docker: backend :8000, Streamlit :8501, Mini App :8080, бот (если есть токен)
make ingest    # загрузить демо-документы фонда из data/demo
make seed      # загрузить 40 демо-анкет волонтёров (в пустую базу)
```

Потом откройте:
- http://localhost:8501 — Streamlit (вопросы по документам, чат, загрузка файлов);
- http://localhost:8080 — Mini App в браузере (в режиме гостя);
- http://localhost:8000/docs — Swagger API.

Проверка: `make smoke` (живой бэкенд), `make test` (pytest), `make lint`.

> **Windows:** команды `make` запускайте из Git Bash. GNU make ставится так: `winget install ezwinports.make`.
> Нужны [uv](https://docs.astral.sh/uv/), Node.js 22+ и Docker Desktop.

### Без Docker

```bash
make dev           # бэкенд с автоперезагрузкой
make dev-web       # Streamlit
make dev-miniapp   # Mini App на Vite (/api проксируется на :8000)
make dev-bot       # бот
```

## Переключить LLM-провайдера

Всё задаётся в `.env`, в коде ничего не меняется (описание каждой переменной — в `.env.example`):

| `LLM_PROVIDER` | Что нужно в `.env` | Эмбеддинги для RAG |
|---|---|---|
| `fake` | ничего | «мешок слов» без сети |
| `yandex` | `YANDEX_API_KEY`, `YANDEX_FOLDER_ID` (+ `YANDEX_MODEL`) | `text-search-doc` / `text-search-query` |
| `gigachat` | `GIGACHAT_CREDENTIALS`, `GPT2GIGA_API_KEY`, затем `docker compose --profile gigachat up -d` | `EmbeddingsGigaR` через gpt2giga |
| `openai_compatible` | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | `LLM_EMBED_MODEL` |
| `anthropic` | `ANTHROPIC_API_KEY`, `uv sync --group anthropic` | локальные (`uv sync --group local-embeddings`) |

После смены провайдера: `make up` (перезапуск) и `make ingest`. У каждой модели эмбеддингов своя
коллекция в Chroma, поэтому документы нужно загрузить заново.

Если эмбеддинги провайдера недоступны, поставьте `EMBEDDINGS_PROVIDER=local`: тогда работает
sentence-transformers на CPU. Для этого нужна группа `uv sync --group local-embeddings` (тянет torch, около 2 ГБ).

## Как устроено

```
backend/app/
  main.py            FastAPI, CORS, роутеры, ошибки LLM → 502
  config.py          все настройки из .env
  llm/client.py      chat() · chat_json(schema) · stream() · embed()
  llm/providers.py   fake / OpenAI-совместимые (Yandex, GigaChat, …) / Anthropic, ретраи, fallback-модель
  llm/prompts/*.md   промпты, переменные $name
  rag/               ingest (PDF/DOCX/XLSX/CSV/TXT/MD) → retrieve → answer с источниками
  api/               /health, /chat, /chat/stream, /documents/*, /telegram/auth, /case/run
  services/case.py   ЗАГЛУШКА под логику кейса
bot/                 aiogram 3, ходит только в бэкенд по HTTP
web/                 Streamlit
miniapp/             Vite + React + TS + Tailwind, Telegram WebApp SDK
```

Подробнее: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Порядок работы в день хакатона:
заполнить [docs/CASE.md](docs/CASE.md), выполнить `/case-kickoff` в Claude Code, писать в `services/case.py`
и `prompts/case.md`. Питч — по шаблону [docs/PITCH.md](docs/PITCH.md), перед выступлением —
[docs/DEMO_CHECKLIST.md](docs/DEMO_CHECKLIST.md).

### API (основное)

| Метод | Путь | Что делает |
|---|---|---|
| GET | `/health` | статус, провайдер, модель, сколько фрагментов в базе |
| POST | `/chat` | `{"message", "history"}` → `{"answer"}` |
| POST | `/chat/stream` | то же, но SSE-поток `data: {"delta": "..."}` |
| POST | `/documents/upload` | multipart `file` → индексация |
| POST | `/documents/ask` | `{"question"}` → `{"answer", "found", "sources"}` |
| GET / DELETE | `/documents`, `/documents/{name}` | список файлов / удаление |
| POST | `/telegram/auth` | проверка `initData` Mini App |
| POST | `/case/run` | заглушка кейса (JSON по схеме) |

## Telegram-бот и Mini App

1. Создайте бота у [@BotFather](https://t.me/BotFather) и положите токен в `TELEGRAM_BOT_TOKEN`.
2. Mini App нужен https-адрес. Есть два варианта:
   - **туннель с ноутбука:** `make tunnel`. Выведет адрес вида `https://xxx.trycloudflare.com`;
   - **сервер с доменом:** см. «Деплой» ниже, адрес `https://DOMAIN`.
3. Пропишите адрес в `WEBAPP_URL` в `.env` и в BotFather (`/newapp` или Menu Button), затем `docker compose up -d bot`.
4. В боте появится кнопка «📱 Открыть приложение». Бэкенд проверяет подпись `initData`.
   Если выставить `TELEGRAM_AUTH_REQUIRED=true`, запросы без подписи отклоняются.

Адрес туннеля меняется при каждом перезапуске cloudflared. Для демо надёжнее сервер.

## Деплой на сервер

**Каждый мерж в `main` выкладывается сам** (`.github/workflows/deploy.yml`): GitHub Actions собирает образы,
загружает их на сервер Yapp по ssh и поднимает стек. Адреса:
- https://deti.201-34-157-90.sslip.io — сайт и Mini App (`/admin` — кабинет фонда);
- https://deti.201-34-157-90.sslip.io/api/health — API;
- https://deti.201-34-157-90.sslip.io/demo — Streamlit.

Ход выкладки — во вкладке Actions → Deploy. Перевыложить `main` вручную: `make deploy`.
Ключи LLM и токен бота для прода — **отдельные секреты репозитория** (Settings → Secrets → Actions):
`gh secret set TELEGRAM_BOT_TOKEN` (значение `gh` спросит сам), так же `YANDEX_API_KEY`, `YANDEX_FOLDER_ID`,
`GIGACHAT_CREDENTIALS` и т.п. Провайдер — переменная репозитория: `gh variable set LLM_PROVIDER --body yandex`.
Полный список — в начале `.github/workflows/deploy.yml`. После изменения — `make deploy`.
Как устроено и почему на одном сервере с Yapp — в `deploy/docker-compose.prod.yml`.

### Свой сервер

На сервере (Ubuntu с Docker):

```bash
git clone <repo> kod-so-smyslom-2 && cd kod-so-smyslom-2
cp .env.example .env   # заполнить: LLM_*, TELEGRAM_BOT_TOKEN, DOMAIN, WEBAPP_URL=https://DOMAIN, STREAMLIT_BASE_PATH=demo
docker compose --profile prod up -d --build
bash scripts/ingest.sh data/demo
```

DNS-запись `A` домена должна указывать на сервер, порты 80 и 443 должны быть открыты. HTTPS-сертификат Caddy
получает сам.

## Правила репозитория

- `main` всегда рабочий, ветки `a/...` (бэкенд и AI) и `b/...` (интерфейс и деплой). Подробнее — в [CLAUDE.md](CLAUDE.md).
- Секреты только в `.env`.
- Хук `.githooks/commit-msg` (включается `make setup`) не пропускает коммиты с AI-атрибуцией
  в сообщении. Та же проверка есть в CI.
- CI (GitHub Actions): ruff, pytest и smoke-тест на `fake`-провайдере, сборка Mini App.

Все данные в `data/demo/` вымышлены.
