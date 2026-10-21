"""Контракт API: что приходит в запросах и что уходит в ответах."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    history: list[ChatMessage] = Field(default_factory=list, description="предыдущие реплики")
    user_id: str | None = None
    channel: str = "api"  # api | bot | web | miniapp


class Source(BaseModel):
    source: str  # имя файла
    chunk: int  # номер фрагмента в файле
    score: float  # сходство 0..1
    text: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source] = Field(
        default_factory=list, description="фрагменты документов фонда, на которых основан ответ"
    )
    provider: str
    model: str


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


class Thanks(BaseModel):
    """GET /volunteers/{id}/thanks — благодарность от фонда за часы и роли, координатор копирует её."""

    text: str
    ai: bool = Field(description="false — написана по шаблону, без LLM")


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
    correct_answers: list[int] = Field(
        description="индексы правильных вариантов, только после сдачи теста"
    )
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


class PlanQuestion(BaseModel):
    question: str  # что спросить, обычными словами
    why: str  # зачем: что уточняем по анкете


class InterviewPlan(BaseModel):
    """GET /volunteers/{id}/interview-plan — вопросы к собеседованию под анкету."""

    volunteer_id: int
    questions: list[PlanQuestion]
    focus: list[str]  # на что обратить внимание
    ai: bool  # False — базовый план по правилам, LLM недоступен
    created_at: datetime


Decision = Literal["next", "think", "reject"]  # дальше / подумать / не подходит


class InterviewResultIn(BaseModel):
    """PUT /interviews/{id}/result — итог после звонка. Только для фонда, в LLM не уходит."""

    motivation: int = Field(ge=1, le=5)
    readiness: int = Field(ge=1, le=5, description="готовность к работе с подопечными")
    regularity: int = Field(ge=1, le=5, description="насколько надёжно будет приходить")
    decision: Decision
    roles: list[str] = Field(default_factory=list, description="коды ролей из data/roles.json")
    comment: str = Field(default="", max_length=4000)


class InterviewResult(InterviewResultIn):
    created_at: datetime


class Interview(BaseModel):
    id: int
    volunteer_id: int
    starts_at: datetime
    status: InterviewStatus
    token: str  # ссылка на звонок — /call/<token>
    notified: bool  # ссылка ушла волонтёру в Telegram; false — координатор отправит её сам
    created_at: datetime
    result: InterviewResult | None = None  # итог после звонка; волонтёру не показываем


class InterviewUpdate(BaseModel):
    """PATCH /interviews/{id} — отметить, что прошло, или отменить."""

    status: InterviewStatus


class InterviewSlots(BaseModel):
    """GET /interviews/slots — свободное время, на которое волонтёр может записаться сам."""

    slots: list[datetime]  # местное (московское) время начала, по порядку
    minutes: int  # сколько длится собеседование


class InterviewBookIn(BaseModel):
    """POST /volunteers/{id}/interviews/book — волонтёр записывается на время из slots."""

    starts_at: datetime


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


# ===== Дашборды кабинета координатора (T-66) =====
# Имена волонтёров здесь — для экрана фонда; в LLM дашборды не ходят.


class VolunteerRef(BaseModel):
    id: int
    name: str


class TodayInterview(BaseModel):
    interview_id: int
    volunteer: VolunteerRef
    starts_at: datetime
    token: str  # ссылка на звонок — /call/<token>?as=coordinator
    overdue: bool  # время прошло, а итога нет


class WaitingVolunteer(BaseModel):
    volunteer: VolunteerRef
    since: datetime  # анкета от / последний тест
    days: int  # сколько дней ждёт
    training_score: int | None = None


class PendingResponse(BaseModel):
    participation_id: int
    opportunity_id: int
    opportunity_title: str
    starts_at: datetime
    volunteer: VolunteerRef


class Understaffed(BaseModel):
    opportunity_id: int
    title: str
    starts_at: datetime
    slots: int
    taken: int
    missing: int


class Counters(BaseModel):
    volunteers: int
    active: int  # участвовали за 60 дней
    hours_total: float
    hours_month: float  # занятия с начала текущего месяца


class DashboardToday(BaseModel):
    """GET /dashboard/today — что требует внимания координатора сегодня."""

    interviews: list[TodayInterview]  # сегодня и прошедшие без итога, по времени
    new_without_interview: list[WaitingVolunteer]  # дольше ждут — выше
    awaiting_approval: list[WaitingVolunteer]  # обучение пройдено, ждут допуска
    pending_responses: list[PendingResponse]  # отклики на будущие занятия без ответа
    understaffed: list[Understaffed]  # ближайшие 7 дней, не хватает людей
    counters: Counters


FunnelStep = Literal["applied", "interviewed", "trained", "approved", "participated", "active"]


class FunnelRow(BaseModel):
    step: FunnelStep
    count: int
    by_occupation: dict[Occupation, int]  # все 6 видов занятости, нули тоже


class SupplyRow(BaseModel):
    key: str  # Availability (время) или Region; для онлайн-занятий — "online"
    demand: int  # свободных мест в занятиях на 30 дней вперёд
    supply: int  # допущенных волонтёров, которым подходит


class WeekRow(BaseModel):
    week_start: date  # понедельник
    hours: float
    participations: int


class TopVolunteer(BaseModel):
    volunteer: VolunteerRef
    hours: float
    participations: int


class Dormant(BaseModel):
    volunteer: VolunteerRef
    last_attended: date | None  # None — допущен, но ни разу не участвовал
    days: int | None


class DashboardAnalytics(BaseModel):
    """GET /dashboard/analytics — воронка, спрос и предложение, активность за 12 недель."""

    funnel: list[FunnelRow]  # 6 шагов по порядку, «дошёл хотя бы до»
    by_time: list[SupplyRow]  # 4 слота в порядке Availability
    by_region: list[SupplyRow]  # только где есть спрос или люди
    weeks: list[WeekRow]  # 12 недель, последняя — текущая
    top: list[TopVolunteer]  # 5 по часам за 12 недель
    dormant: list[Dormant]  # допущены, но не участвовали 45+ дней или ни разу


# ===== Вход на сайт по почте и паролю =====

AccountRole = Literal["volunteer", "coordinator"]


class RegisterIn(BaseModel):
    """POST /auth/register."""

    email: str = Field(min_length=3, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=6, max_length=200)
    role: AccountRole = "volunteer"
    code: str = Field(default="", max_length=100, description="код фонда — нужен координатору")


class LoginIn(BaseModel):
    """POST /auth/login."""

    email: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class AccountOut(BaseModel):
    """GET /auth/me — кто вошёл."""

    id: int
    email: str
    role: AccountRole
    volunteer_id: int | None = None  # None — анкета ещё не заполнена


class FundCode(BaseModel):
    """GET/PUT /auth/fund-code — код фонда, без которого нельзя зарегистрироваться координатором."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(min_length=4, max_length=100, pattern=r"^\S+$", description="без пробелов")


class AuthOut(BaseModel):
    """Ответ на регистрацию и вход: ключ для заголовка Authorization: Bearer <token>."""

    token: str
    account: AccountOut


class CodeSent(BaseModel):
    """Ответ на POST /auth/register и /auth/register/resend: на почту ушёл код, аккаунта ещё нет.
    Код вводят в POST /auth/register/verify. Если почта на сервере не настроена, /auth/register
    сразу отвечает AuthOut — регистрация без кода."""

    pending: Literal[True] = True
    email: str
    resend_after: int = Field(description="через сколько секунд можно отправить код ещё раз")


class EmailIn(BaseModel):
    """POST /auth/register/resend."""

    email: str = Field(min_length=3, max_length=200)


class VerifyIn(BaseModel):
    """POST /auth/register/verify — код из письма."""

    email: str = Field(min_length=3, max_length=200)
    code: str = Field(min_length=1, max_length=20)


# ===== Оформление личного кабинета =====

LookColor = Literal["blue", "cyan", "green", "orange", "berry", "yellow"]
LookCover = Literal["sky", "sunset", "meadow", "sea", "berry", "night"]


class Look(BaseModel):
    """GET и PUT /auth/look. Только для красоты: в LLM и индекс не уходит."""

    avatar: str = Field(default="", max_length=16, description="эмодзи; пусто — первая буква имени")
    color: LookColor = "blue"
    cover: LookCover = "sky"
    stickers: list[Annotated[str, Field(max_length=16)]] = Field(default_factory=list, max_length=3)
    nickname: str = Field(
        default="", max_length=40, description="как обращаться; пусто — имя из анкеты"
    )


# ---------- Переписка фонда с волонтёром (T-100) ----------
# Текст сообщений в LLM и в индекс не уходит.

Sender = Literal["coordinator", "volunteer"]


class MessageIn(BaseModel):
    """POST /volunteers/{id}/dialog/messages — написать в переписку."""

    sender: Sender
    text: str = Field(min_length=1, max_length=1000)
    opportunity_id: int | None = None  # «о занятии …» — если пишут с карточки занятия


class Message(BaseModel):
    id: int
    sender: Sender
    text: str
    opportunity_id: int | None = None
    opportunity_title: str | None = None
    created_at: datetime


class DialogOut(BaseModel):
    """Переписка глазами того, кто смотрит (reader в запросе)."""

    volunteer: VolunteerRef
    messages: list[Message]  # старые сверху, не больше 200 последних
    unread: int  # сколько новых от собеседника
    their_read_id: int  # до какого сообщения дочитал собеседник — для отметки «прочитано»


class DialogSummary(BaseModel):
    """Строка списка переписок у координатора."""

    volunteer: VolunteerRef
    last: Message | None
    unread: int  # новых от волонтёра


class ReadIn(BaseModel):
    """POST /volunteers/{id}/dialog/read — отметить переписку прочитанной."""

    reader: Sender


class UnreadOut(BaseModel):
    unread: int  # сколько непрочитанных осталось: у волонтёра — в его переписке, у фонда — во всех
