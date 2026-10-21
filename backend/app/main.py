"""FastAPI-приложение. Запуск: make dev  (или uv run uvicorn app.main:app --reload)"""

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import (
    auth,
    calls,
    case,
    chat,
    dashboard,
    documents,
    health,
    interviews,
    messages,
    opportunities,
    roles,
    search,
    telegram_auth,
    training,
    volunteers,
)
from app.config import get_settings
from app.db import init_db
from app.llm.providers import LLMError
from app.log import setup_logging
from app.rag.ingest import autoload_if_empty

log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    s = get_settings()
    setup_logging(s.log_level)
    init_db()
    log.info("Бэкенд запущен: LLM_PROVIDER=%s", s.llm_provider)
    if s.rag_autoload:
        # в фоне: эмбеддинги — сетевые вызовы, а /health должен отвечать сразу
        threading.Thread(target=autoload_if_empty, daemon=True).start()
    yield


app = FastAPI(title="Код со смыслом 2 — API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(LLMError)
async def llm_error_handler(_: Request, exc: LLMError) -> JSONResponse:
    log.error("LLM: %s", exc)
    return JSONResponse(status_code=502, content={"detail": str(exc)})


for module in (
    health,
    chat,
    documents,
    telegram_auth,
    case,
    volunteers,
    roles,
    search,
    training,
    opportunities,
    interviews,
    dashboard,
    calls,
    auth,
    messages,
):
    app.include_router(module.router)
