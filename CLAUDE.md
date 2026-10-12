# CLAUDE.md

Стартовый шаблон к 24-часовому хакатону ВШЭ «Код со смыслом 2» (21–22 октября 2026).
Цель — за 15 минут после выбора кейса получить прототип «данные НКО → LLM → интерфейс → ссылка для жюри».
Кейс описывается в `docs/CASE.md`, разбор — командой `/case-kickoff`.

## Роли и зоны (чтобы не пересекаться в файлах)

| Кто | Зона | Папки |
|---|---|---|
| **A — бэкенд и AI** | API, промпты, RAG, документы, БД | `backend/`, `data/`, `docs/CASE.md` |
| **B — интерфейс и деплой** | бот, Mini App, Streamlit, Docker, сервер | `bot/`, `miniapp/`, `web/`, `deploy/`, `docker/`, `docker-compose.yml` |

Общая граница — контракт API: `backend/app/schemas.py` ↔ `bot/api_client.py` ↔ `miniapp/src/api.ts`.
Меняешь схему — предупреди напарника и обнови клиенты в том же PR.

## Команды

```
make setup        # зависимости (uv, npm), .env, git-хуки
make dev          # бэкенд локально :8000 (/docs — Swagger)
make dev-bot | dev-web | dev-miniapp
make up / down / logs   # всё в Docker
make ingest       # data/demo → Chroma через API (бэкенд должен работать)
make test         # pytest на провайдере fake
make lint / fmt   # ruff + tsc
make smoke        # smoke-тест живого бэкенда
make tunnel       # https-адрес для Mini App через cloudflared
make deploy       # на сервер (DEPLOY_HOST в .env), профиль prod с Caddy
```
На Windows — из Git Bash.

## Где что

- LLM — только через `app.llm.client.get_llm()`: `chat()`, `chat_json(prompt, Schema)` (валидация + 1 повтор), `stream()`, `embed()`. Провайдер — `LLM_PROVIDER` в `.env`, фабрика в `llm/providers.py`.
- Промпты — `backend/app/llm/prompts/*.md`, переменные `$name`, загрузка `load_prompt("name", ...)`.
- Логика кейса — `backend/app/services/case.py` (эндпоинт `POST /case/run`).
- RAG — `backend/app/rag/` (ingest → retrieve → answer с источниками и «не знаю»).
- Бот и фронты ходят **только в бэкенд по HTTP**, не в LLM напрямую.

## Принципы

- Один рабочий сквозной сценарий важнее пяти фич. Сначала демо работает целиком на `fake`, потом подключаем реальный LLM.
- Простой код, понятный человеку: техлиды читают код и AI-часть. Без лишних абстракций и магии.
- Никаких новых зависимостей без необходимости.
- Секреты — только в `.env` (он в `.gitignore`), никогда в коде и коммитах.
- Логика кейса — в `services/`, промпты — в `prompts/`, схемы — в `schemas.py`.
- Любой внешний вызов — с таймаутом и понятным сообщением об ошибке.
- Перед коммитом: `make lint && make test`.

## Git

- `main` всегда рабочий. Ветки `a/<задача>` и `b/<задача>`, мелкие PR/мержи.
- Маленькие коммиты с понятными сообщениями на русском или английском.

## Авторство

Никогда не добавляй себя (Claude / Claude Code / Anthropic) в соавторы или авторы: ни `Co-Authored-By`, ни подписей "Generated with Claude Code" в коммитах, PR, issues, README, комментариях и любых других файлах. Коммиты — только от имени настроенного git-пользователя.

(Это же закреплено в `.claude/settings.json` и git-хуком `.githooks/commit-msg`.)
