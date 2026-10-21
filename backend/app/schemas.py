"""Контракт API: что приходит в запросах и что уходит в ответах."""

from datetime import datetime
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


# =====================================================================
# Умный поиск волонтёров «Дети Марии» — контракт между A и B.
# Меняешь здесь — поменяй типы в miniapp/src/api.ts в том же PR.
#
# Персональные данные (name, contact, telegram_id) живут только в нашей БД.
# В LLM и в векторный индекс уходят только Answers и Profile.
# =====================================================================

Availability = Literal["weekday_morning", "weekday_day", "weekday_evening", "weekend"]
Occupation = Literal["student", "pensioner", "remote", "employed", "schoolkid", "other"]
VolunteerStatus = Literal["new", "training", "trained", "approved", "active", "paused"]
RoleKind = Literal["regular", "episodic"]


class Answers(BaseModel):
    """Ответы анкеты — обезличенная часть, её можно отправлять в LLM."""

    about: str = Field(min_length=1, max_length=2000, description="о себе, чем занимается")
    skills: str = Field(default="", max_length=2000, description="что умеет: профессия, хобби")
    wishes: str = Field(default="", max_length=2000, description="чем хочет помогать фонду")
    experience: str = Field(
        default="", max_length=2000, description="опыт волонтёрства, работы с детьми и людьми с ОВЗ"
    )
    availability: list[Availability] = Field(default_factory=list, description="когда свободен")
    occupation: Occupation = "other"


class Profile(BaseModel):
    """Что LLM извлекает из ответов анкеты."""

    skills: list[str] = Field(description="навыки короткими тегами: рисование, фото, монтаж…")
    interests: list[str] = Field(description="чем хочет заниматься, короткими тегами")
    suitable_roles: list[str] = Field(description="коды подходящих ролей из data/roles.json")
    summary: str = Field(description="одна фраза о кандидате для координатора, без имени")


class VolunteerIn(BaseModel):
    """POST /volunteers — анкета."""

    name: str = Field(min_length=1, max_length=100)
    contact: str = Field(min_length=1, max_length=200, description="телефон, e-mail или @username")
    telegram_id: int | None = None
    answers: Answers


class VolunteerOut(BaseModel):
    id: int
    name: str
    contact: str
    telegram_id: int | None = None
    answers: Answers
    profile: Profile | None = None  # None — LLM ещё не обработал анкету
    status: VolunteerStatus = "new"
    training_score: int | None = Field(
        default=None, description="средний % по тестам, None — не проходил"
    )
    hours: float = 0
    created_at: datetime


class VolunteerUpdate(BaseModel):
    """PATCH /volunteers/{id} — меняет координатор."""

    status: VolunteerStatus | None = None
    hours: float | None = Field(default=None, ge=0)


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    author: str = Field(default="координатор", max_length=100)


class Note(NoteIn):
    """История взаимодействия. В LLM не отправляется."""

    id: int
    volunteer_id: int
    created_at: datetime


class Role(BaseModel):
    """Роль волонтёра из рабочего файла фонда (data/roles.json)."""

    code: str  # например "photographer"
    title: str
    description: str
    skills: list[str]
    availability: list[Availability]
    kind: RoleKind


class SearchRequest(BaseModel):
    """POST /search — запрос координатора своими словами."""

    query: str = Field(default="", max_length=1000)
    role_code: str | None = Field(default=None, description="искать под роль из справочника")
    statuses: list[VolunteerStatus] = Field(
        default_factory=list, description="пусто — все, кроме paused"
    )
    limit: int = Field(default=10, ge=1, le=50)


class ParsedQuery(BaseModel):
    """Как система поняла запрос — показываем координатору чипсами."""

    skills: list[str] = Field(description="нужные навыки короткими тегами")
    availability: list[Availability] = Field(description="когда нужен волонтёр; пусто — неважно")
    kind: Literal["regular", "episodic", "any"] = Field(description="разовая или постоянная помощь")
    notes: str = Field(description="что ещё важно в запросе, одна фраза; '' если нечего")


class Candidate(BaseModel):
    volunteer: VolunteerOut
    score: int = Field(ge=0, le=100)
    reason: str = Field(description="почему подходит, одна фраза")
    matched_skills: list[str] = Field(default_factory=list)
    ai: bool = Field(default=True, description="False — оценка без LLM (фолбэк)")


class SearchResponse(BaseModel):
    parsed: ParsedQuery
    candidates: list[Candidate]
    total_checked: int = Field(description="сколько анкет прошло фильтр")


class TrainingModule(BaseModel):
    id: str  # имя файла без .md
    title: str
    text: str  # markdown


class QuizQuestion(BaseModel):
    question: str
    options: list[str] = Field(min_length=2, max_length=5)
    # правильный ответ клиенту не отдаём


class Quiz(BaseModel):
    module_id: str
    questions: list[QuizQuestion]


class QuizSubmit(BaseModel):
    volunteer_id: int
    module_id: str
    answers: list[int] = Field(description="индекс выбранного варианта на каждый вопрос")


class QuizResult(BaseModel):
    score: int = Field(ge=0, le=100, description="% правильных")
    passed: bool
    correct: list[bool]
    status: VolunteerStatus  # статус волонтёра после проверки
