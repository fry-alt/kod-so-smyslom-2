"""Контракт API: что приходит в запросах и что уходит в ответах."""

from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    history: list[ChatMessage] = Field(default_factory=list, description="предыдущие реплики")
    user_id: str | None = None
    channel: str = "api"  # api | bot | web | miniapp


class ChatResponse(BaseModel):
    answer: str
    provider: str
    model: str


class Source(BaseModel):
    source: str  # имя файла
    chunk: int  # номер фрагмента в файле
    score: float  # сходство 0..1
    text: str


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    top_k: int | None = Field(default=None, ge=1, le=20)
    user_id: str | None = None
    channel: str = "api"


class AskResponse(BaseModel):
    answer: str
    found: bool
    sources: list[Source]


class UploadResponse(BaseModel):
    filename: str
    chunks: int


class DocumentsInfo(BaseModel):
    collection: str
    chunks: int
    files: list[str]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    llm_provider: str
    llm_model: str
    embeddings: str
    documents: int
    error: str | None = None


class TelegramAuthRequest(BaseModel):
    init_data: str


class TelegramUser(BaseModel):
    id: int
    first_name: str = ""
    last_name: str | None = None
    username: str | None = None
    language_code: str | None = None


class ErrorResponse(BaseModel):
    detail: str
