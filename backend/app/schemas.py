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
Region = Literal["moscow", "moscow_region", "yaroslavl", "north_ossetia", "other"]
Format = Literal["offline", "online"]
Regularity = Literal["regular", "episodic", "any"]
ParticipationStatus = Literal["responded", "invited", "confirmed", "attended", "declined"]


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
    region: Region = "moscow"
    formats: list[Format] = Field(default_factory=lambda: ["offline"], description="очно / онлайн")
    regularity: Regularity = Field(default="any", description="постоянно или разово")


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
    format: Format = "offline"
    regions: list[Region] = Field(default_factory=list, description="пусто — любой регион")


class SearchRequest(BaseModel):
    """POST /search — запрос координатора своими словами."""

    query: str = Field(default="", max_length=1000)
    role_code: str | None = Field(default=None, description="искать под роль из справочника")
    opportunity_id: int | None = Field(default=None, description="подобрать под возможность")
    statuses: list[VolunteerStatus] = Field(
        default_factory=list, description="пусто — все, кроме paused"
    )
    limit: int = Field(default=10, ge=1, le=50)


class ParsedQuery(BaseModel):
    """Как система поняла запрос — показываем координатору чипсами."""

    skills: list[str] = Field(description="нужные навыки короткими тегами")
    availability: list[Availability] = Field(description="когда нужен волонтёр; пусто — неважно")
    kind: Regularity = Field(description="разовая или постоянная помощь")
    region: Region | None = Field(default=None, description="где нужен волонтёр; None — неважно")
    format: Format | None = Field(default=None, description="очно или онлайн; None — неважно")
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
    required: bool = True  # обязательный модуль; дополнительные на статус не влияют


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


# ---------- Каталог возможностей и учёт участия ----------


class OpportunityIn(BaseModel):
    """Задача или мероприятие фонда — POST /opportunities (координатор)."""

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    role_code: str | None = None  # роль из data/roles.json, по ней строится подбор
    starts_at: datetime
    region: Region = "moscow"
    format: Format = "offline"
    place: str = Field(default="", max_length=300)
    slots: int = Field(default=1, ge=1, description="сколько волонтёров нужно")
    hours: float = Field(default=3, gt=0, description="сколько часов начислить за участие")


class OpportunityOut(OpportunityIn):
    id: int
    taken: int = 0  # confirmed + attended
    recommended: bool = False  # подходит волонтёру (если передан volunteer_id)
    my_status: ParticipationStatus | None = None  # статус участия этого волонтёра


class Participation(BaseModel):
    """Отклик или приглашение волонтёра на возможность."""

    id: int
    opportunity_id: int
    opportunity_title: str
    volunteer_id: int
    volunteer_name: str
    status: ParticipationStatus
    hours: float = 0  # начислено после attended
    created_at: datetime


class RespondIn(BaseModel):
    """POST /opportunities/{id}/respond — волонтёр откликается."""

    volunteer_id: int


class InviteIn(BaseModel):
    """POST /opportunities/{id}/invite — координатор приглашает найденных поиском."""

    volunteer_ids: list[int] = Field(min_length=1, max_length=50)


class ParticipationUpdate(BaseModel):
    """PATCH /participations/{id} — подтвердить, отметить участие (начисляет часы), отказать."""

    status: ParticipationStatus


# ---------- Видеособеседование ----------

InterviewStatus = Literal["scheduled", "done", "canceled"]
CallRole = Literal["coordinator", "volunteer"]


class InterviewIn(BaseModel):
    """POST /volunteers/{id}/interviews — координатор назначает собеседование."""

    starts_at: datetime


class Interview(BaseModel):
    id: int
    volunteer_id: int
    starts_at: datetime
    status: InterviewStatus
    token: str  # ссылка на звонок — /call/<token>
    notified: bool  # ссылка ушла волонтёру в Telegram; false — координатор отправит её сам
    created_at: datetime


class InterviewUpdate(BaseModel):
    """PATCH /interviews/{id} — отметить, что прошло, или отменить."""

    status: InterviewStatus


class IceServer(BaseModel):
    """Сервер STUN/TURN для RTCPeerConnection — поля как в браузерном RTCIceServer."""

    urls: list[str]
    username: str | None = None
    credential: str | None = None


class CallInfo(BaseModel):
    """GET /calls/{token} — всё, что нужно странице звонка. Имён здесь нет: ссылку могут переслать."""

    starts_at: datetime
    status: InterviewStatus
    ice_servers: list[IceServer]
