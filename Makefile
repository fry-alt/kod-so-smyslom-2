# Команды проекта. На Windows запускайте из Git Bash (нужен GNU make: winget install ezwinports.make).
# echo в рецептах — латиницей: make на Windows портит кириллицу в аргументах команд.
SHELL := bash
.DEFAULT_GOAL := help

# DEPLOY_HOST, DEPLOY_DIR, BACKEND_URL можно задать в .env
-include .env
BACKEND_URL ?= http://localhost:8000
DEPLOY_DIR ?= kod-so-smyslom-2
export BACKEND_URL
# UTF-8 для вывода Python на Windows (логи и кириллица при перенаправлении в файл)
export PYTHONUTF8 := 1

COMPOSE := docker compose

.PHONY: help setup dev dev-bot dev-web dev-miniapp up down logs ingest test lint fmt smoke tunnel deploy

help: ## показать команды
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'

setup: ## поставить зависимости, создать .env, включить git-хуки
	uv sync
	cd miniapp && npm install
	@test -f .env || (cp .env.example .env && echo "Created .env from .env.example")
	git config core.hooksPath .githooks
	@echo "Done. Next: make up (Docker) or make dev (local backend)"

dev: ## бэкенд локально с автоперезагрузкой → http://localhost:8000/docs
	uv run uvicorn app.main:app --reload --port 8000

dev-bot: ## бот локально (нужен TELEGRAM_BOT_TOKEN)
	uv run python -m bot.main

dev-web: ## Streamlit локально → http://localhost:8501
	uv run streamlit run web/streamlit_app.py

dev-miniapp: ## Mini App локально (Vite) → http://localhost:5173
	cd miniapp && npm run dev

up: ## поднять всё в Docker
	$(COMPOSE) up -d --build
	@echo "API: http://localhost:8000/docs | Streamlit: http://localhost:8501 | Mini App: http://localhost:8080"
	@echo "Next: make ingest"

down: ## остановить Docker
	$(COMPOSE) --profile tunnel --profile gigachat --profile prod down

logs: ## логи всех сервисов
	$(COMPOSE) logs -f --tail=100

ingest: ## загрузить data/demo в базу знаний (бэкенд должен работать)
	bash scripts/ingest.sh data/demo

test: ## тесты (провайдер fake, без сети)
	uv run pytest

lint: ## ruff + проверка типов Mini App
	uv run ruff check .
	uv run ruff format --check .
	cd miniapp && npm run typecheck

fmt: ## автоформатирование
	uv run ruff format .
	uv run ruff check --fix .

smoke: ## smoke-тест работающего бэкенда
	bash scripts/smoke_test.sh $(BACKEND_URL)

tunnel: ## публичный https-адрес для Mini App через cloudflared (без домена)
	$(COMPOSE) --profile tunnel up -d cloudflared
	@echo "Waiting for tunnel URL..."
	@for i in $$(seq 1 30); do \
		url=$$($(COMPOSE) logs cloudflared 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1); \
		if [ -n "$$url" ]; then \
			echo "Mini App: $$url"; \
			echo "Set WEBAPP_URL=$$url in .env and in @BotFather, then: docker compose up -d bot"; \
			exit 0; \
		fi; sleep 2; \
	done; echo "No tunnel URL yet, see: docker compose logs cloudflared"; exit 1

deploy: ## деплой на сервер: git pull + docker compose --profile prod
	@test -n "$(DEPLOY_HOST)" || (echo "Set DEPLOY_HOST=user@server in .env" && exit 1)
	ssh $(DEPLOY_HOST) 'cd $(DEPLOY_DIR) && git pull --ff-only && docker compose --profile prod up -d --build'
