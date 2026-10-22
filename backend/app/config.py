"""Настройки приложения. Все значения берутся из переменных окружения / файла .env.

Описание каждой переменной — в .env.example.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

LLMProvider = Literal["fake", "openai_compatible", "yandex", "gigachat", "anthropic"]
EmbeddingsProvider = Literal["auto", "provider", "local", "fake"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    log_level: str = "INFO"
    cors_origins: str = "*"  # через запятую

    # --- LLM ---
    llm_provider: LLMProvider = "fake"
    llm_timeout: float = 60.0
    llm_max_retries: int = 2
    llm_temperature: float = 0.3
    llm_max_tokens: int = 2000

    # openai_compatible: любой OpenAI-совместимый endpoint
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    llm_fallback_model: str = ""  # если основная модель упала — пробуем эту
    llm_embed_model: str = "text-embedding-3-small"

    # yandex: OpenAI-совместимый API Yandex Cloud AI Studio
    yandex_base_url: str = "https://ai.api.cloud.yandex.net/v1"
    yandex_api_key: str = ""
    yandex_folder_id: str = ""
    yandex_model: str = "yandexgpt/latest"
    yandex_fallback_model: str = "yandexgpt-lite/latest"
    yandex_embed_doc_model: str = "text-search-doc/latest"
    yandex_embed_query_model: str = "text-search-query/latest"

    # gigachat: через прокси gpt2giga (docker compose --profile gigachat)
    gigachat_base_url: str = "http://localhost:8090/v1"
    gpt2giga_api_key: str = ""
    gigachat_model: str = "GigaChat-2"
    gigachat_fallback_model: str = ""
    gigachat_embed_model: str = "EmbeddingsGigaR"

    # anthropic: официальный SDK (uv sync --group anthropic)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-5-5"

    # --- эмбеддинги ---
    # auto: fake для LLM_PROVIDER=fake, local для anthropic (у него нет эмбеддингов), иначе provider
    embeddings_provider: EmbeddingsProvider = "auto"
    local_embed_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

    # --- данные ---
    data_dir: Path = Path("data")
    chroma_dir: Path = Path("data/chroma")
    uploads_dir: Path = Path("data/uploads")
    database_url: str = "sqlite:///data/app.db"

    # --- RAG ---
    rag_top_k: int = 4
    rag_min_score: float = 0.2  # ниже этого сходства фрагмент считаем нерелевантным
    chunk_size: int = 800
    chunk_overlap: int = 150
    # при запуске загрузить новые и изменённые документы фонда из data/demo и data/training
    rag_autoload: bool = True

    # --- Telegram ---
    telegram_bot_token: str = ""
    # прокси до Bot API, если сервер не достаёт до api.telegram.org (как у Yapp); пусто — напрямую
    telegram_api_base: str = ""
    telegram_auth_required: bool = False  # true — без валидного initData Mini App не пустит
    telegram_auth_max_age: int = 86400  # секунд
    webapp_url: str = ""  # https-адрес сайта — для ссылки на видеособеседование в сообщении

    # --- вход на сайт ---
    # начальный код фонда для координатора; дальше — в кабинете. Пусто — регистрация координатора закрыта
    coordinator_code: str = ""
    # служебный ключ для бота и скриптов (заголовок X-Service-Key) — пускает туда же, куда координатора
    service_key: str = ""
    api_docs: bool = True  # Swagger /docs и /openapi.json; на проде выключены

    # --- письма с кодом подтверждения почты (Yandex Cloud Postbox) ---
    postbox_key_id: str = ""  # статический ключ сервисного аккаунта с ролью postbox.sender
    postbox_secret: str = ""
    mail_from: str = ""  # отправитель, домен подтверждён в Postbox: «Дети Марии <noreply@...>»
    # Без Postbox: true — код печатается в лог бэкенда (локально), false — регистрация без кода (прод без почты)
    mail_log_codes: bool = True

    # --- видеособеседование (WebRTC) ---
    # STUN помогает браузерам найти друг друга; TURN пересылает видео, когда напрямую не выходит.
    stun_urls: str = "stun:stun.l.google.com:19302"  # через запятую
    turn_urls: str = ""  # через запятую, например turn:example.ru:3478?transport=udp
    turn_secret: str = ""  # --static-auth-secret coturn; пусто — только STUN

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
