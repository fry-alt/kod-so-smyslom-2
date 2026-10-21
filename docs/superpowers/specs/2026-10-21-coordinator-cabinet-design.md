# Кабинет координатора: дашборды, AI-план и итог собеседования

Задача: T-66 (#66). Делит работу: **A (fry-alt)** — бэкенд, контракт, моки, демо-данные; **B (gordeymos)** — экраны
по отдельному Issue (раздел «Экраны для B» ниже). Дата: 2026-10-21.

## Зачем

Сейчас `/admin` — это поиск, база и возможности. Координатору не хватает одного места, где видно, что делать сегодня,
и цифр, которые отвечают на боли фонда из [CASE.md](../../CASE.md):

- «будни утром некому» → спрос и предложение по времени;
- «школьники откликаются ради баллов и отваливаются» → воронка с разрезом по занятости;
- «координатор держит базу в голове» → сводка «что сегодня» и «засыпающие» волонтёры.

Собеседование (T-59) умеет только назначить, позвонить и отметить «прошло». Добавляем то, что помогает решать:
вопросы под конкретную анкету и короткий итог после звонка.

## Что не делаем (сейчас)

- Общее расписание собеседований и самозапись волонтёра на свободное окно — «может быть, потом».
- Изменение статуса волонтёра по итогу собеседования: статус по-прежнему ставит человек.
- Параметры периода у аналитики: окна фиксированные (см. ниже), для базы фонда этого хватает.
- Новые эндпоинты для кабинета волонтёра: всё есть (см. «Кабинет волонтёра»).

## 1. AI-план собеседования

`GET /volunteers/{id}/interview-plan?refresh=false` → `InterviewPlan`

```python
class PlanQuestion(BaseModel):
    question: str  # что спросить, обычными словами
    why: str  # зачем: что уточняем по анкете


class InterviewPlan(BaseModel):
    volunteer_id: int
    questions: list[PlanQuestion]  # 5–7
    focus: list[str]  # 1–3 пункта «на что обратить внимание»
    ai: bool  # False — базовый план без LLM
    created_at: datetime
```

- **Вход LLM — только `answers` и `profile`.** Имя, контакт, `telegram_id`, заметки и итоги прошлых собеседований
  в промпт не попадают (152-ФЗ, договорённость с фондом). Тест проверяет, что имени и контакта нет в тексте промпта.
- Промпт `backend/app/llm/prompts/interview_plan.md` с few-shot примером; вызов `get_llm().chat_json(prompt,
  GeneratedPlan, system=load_prompt("system"))`, где `GeneratedPlan` — `questions` и `focus` без служебных полей.
- **Кэш:** новая таблица `InterviewPlan(volunteer_id PK, questions JSON, focus JSON, ai bool, created_at)`.
  Повторное открытие отдаёт сохранённый план, чтобы вопросы не менялись во время звонка. `refresh=true` строит заново
  и перезаписывает. План привязан к волонтёру, а не к собеседованию: зависит только от анкеты.
- **Фолбэк** (LLM упал, таймаут, невалидный JSON после повтора): базовые вопросы + правила по анкете, `ai=False`.
  Фолбэк не кэшируется — следующий запрос попробует LLM снова.
  - Всегда: почему хотите помогать именно фонду; был ли опыт с детьми или взрослыми с особенностями; что делать,
    если на занятии стало тяжело; как часто реально получится приходить.
  - `occupation == "schoolkid"` → «Нужны ли вам часы или баллы для школы? Сколько занятий планируете?»
  - пустой `experience` → «Как вы представляете занятие с особыми ребятами?»
  - `occupation == "pensioner"` → «Удобно ли вам добираться? Сколько времени комфортно провести на занятии?»
  - `regularity == "regular"` → «Готовы ли вы ходить к одной группе несколько месяцев?»
- Код: `backend/app/services/interview_plan.py` (`get_or_build(session, volunteer, refresh) -> InterviewPlan`,
  `fallback(answers) -> GeneratedPlan`), HTTP — в `backend/app/api/interviews.py`.
- Ошибки: неизвестный волонтёр → 404.

## 2. Итог собеседования

`PUT /interviews/{id}/result` с телом `InterviewResultIn` → `Interview` (с заполненным `result`).

```python
Decision = Literal["next", "think", "reject"]  # дальше / подумать / не подходит


class InterviewResultIn(BaseModel):
    motivation: int = Field(ge=1, le=5)  # мотивация
    readiness: int = Field(ge=1, le=5)  # готовность к работе с подопечными
    regularity: int = Field(ge=1, le=5)  # насколько надёжно будет приходить
    decision: Decision
    roles: list[str] = []  # коды из data/roles.json
    comment: str = ""


class InterviewResult(InterviewResultIn):
    created_at: datetime
```

- `Interview` в ответах получает поле `result: InterviewResult | None` (и в `GET /volunteers/{id}/interviews`).
- **Хранение:** новая таблица `InterviewResult(interview_id PK FK, motivation, readiness, regularity, decision,
  roles JSON, comment, created_at)`. Колонку в `Interview` не добавляем: на проде таблица уже есть, миграций нет,
  а `create_all` создаёт только новые таблицы.
- `PUT` перезаписывает итог (можно поправить) и ставит собеседованию `status = "done"`. Для `canceled` → 409
  «Собеседование отменено».
- Неизвестные коды ролей → 422 со списком неизвестных. Оценки вне 1–5 → 422 (валидация pydantic).
- Итог и комментарий — как заметки координатора: **в LLM и векторный индекс не уходят**, волонтёру не показываются.
- Код: `services/interviews.py` (`save_result`, `result_for`), HTTP — в `api/interviews.py`.

## 3. `GET /dashboard/today` — «что сегодня»

Главный экран координатора. «Сегодня» — местная дата сервера (как и `starts_at`, время без часового пояса).

```python
class VolunteerRef(BaseModel):  # имя — для экрана фонда, в LLM не уходит
    id: int
    name: str


class TodayInterview(BaseModel):
    interview_id: int
    volunteer: VolunteerRef
    starts_at: datetime
    token: str
    overdue: bool  # время прошло, а итога нет


class WaitingVolunteer(BaseModel):
    volunteer: VolunteerRef
    since: datetime  # анкета от / обучение пройдено
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
    interviews: list[TodayInterview]  # сегодня + прошедшие scheduled без итога, по времени
    new_without_interview: list[
        WaitingVolunteer
    ]  # status=new и ни одного scheduled/done собеседования, дольше ждут — выше
    awaiting_approval: list[WaitingVolunteer]  # status=trained
    pending_responses: list[
        PendingResponse
    ]  # participation.status=responded у будущих возможностей
    understaffed: list[Understaffed]  # ближайшие 7 дней, taken < slots, по времени
    counters: Counters
```

`taken` считается так же, как в каталоге возможностей (`services/opportunities.py`: `confirmed` + `attended`).
`hours_total` — сумма `Volunteer.hours` (координатор может поправить часы вручную, цифра совпадёт с базой).
`hours_month` и всё «по датам» — по `attended`-участиям, дата — `starts_at` возможности (у участия нет даты
«участвовал», а дата занятия честнее).

## 4. `GET /dashboard/analytics`

Окна фиксированы: воронка — по всей базе, спрос — занятия на 30 дней вперёд, активность — 12 недель назад.

```python
FunnelStep = Literal["applied", "interviewed", "trained", "approved", "participated", "active"]


class FunnelRow(BaseModel):
    step: FunnelStep
    count: int
    by_occupation: dict[Occupation, int]  # все 6 ключей, нули тоже


class SupplyRow(BaseModel):
    key: str  # Availability (слот времени) или Region
    demand: int  # свободных мест в ближайших занятиях: sum(slots - taken)
    supply: int  # допущенных волонтёров (approved/active), подходящих по этому ключу


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
    funnel: list[FunnelRow]  # 6 шагов по порядку
    by_time: list[SupplyRow]  # 4 слота в порядке AVAILABILITY
    by_region: list[SupplyRow]  # регионы, где есть спрос или предложение
    weeks: list[WeekRow]  # 12 недель, пустые недели — с нулями
    top: list[TopVolunteer]  # 5 по часам за 12 недель
    dormant: list[Dormant]  # допущены, не участвовали 45+ дней или ни разу; дольше — выше
```

Шаги воронки — «дошёл хотя бы до», поэтому числа не растут слева направо:

| Шаг | Условие |
|---|---|
| `applied` | все анкеты |
| `interviewed` | есть собеседование `done` **или** статус дальше `new` (волонтёров до T-59 собеседовали без системы) |
| `trained` | статус `trained`, `approved` или `active` |
| `approved` | статус `approved` или `active` |
| `participated` | хотя бы одно `attended` |
| `active` | `attended` у занятия за последние 60 дней |

Спрос и предложение:
- Слот занятия — `opportunities.time_slot(starts_at)` (уже есть). Волонтёр подходит по слоту, если слот в его
  `answers.availability` (пустой список — свободен всегда, как в `is_recommended`).
- Регион: очные занятия — по `opportunity.region`; онлайн-занятия идут в регион `"online"`, предложение для него —
  волонтёры с `"online"` в `answers.formats`. Волонтёр очно подходит региону, если `answers.region` совпадает
  и `"offline"` в `formats`.

Код: `backend/app/services/dashboard.py` (`today(session, now)`, `analytics(session, now)` — `now` передаётся для
тестов), HTTP — `backend/app/api/dashboard.py` (`/dashboard/today`, `/dashboard/analytics`). Всё считается в Python
по выборкам из БД: в базе фонда сотни записей, SQL-агрегации не нужны и хуже читаются.

## 5. Кабинет волонтёра

Новых эндпоинтов нет. Путь «анкета → собеседование → обучение → допуск → занятия» B собирает из
`GET /volunteers/{id}` (`status`, `training_score`, `hours`), `GET /volunteers/{id}/interviews` (ближайшее
`scheduled` → «Войти в звонок») и `GET /volunteers/{id}/participations`. Часы и достижения — из T-16 (PR #53).

`result` у собеседования волонтёру **не показываем** — это оценка координатора. На фронте раздел «Я» поле игнорирует.
(Отдельного закрытия на бэкенде нет, как и для заметок: авторизация `/admin` — T-17.)

## 6. Контракт и моки

В том же PR, что и бэкенд, с обеих сторон (`schemas.py` ↔ `api.ts`), @gordeymos в описании PR:

- типы `PlanQuestion`, `InterviewPlan`, `Decision`, `InterviewResultIn`, `InterviewResult`, `VolunteerRef`,
  `DashboardToday` (+ вложенные), `DashboardAnalytics` (+ вложенные); `Interview.result`;
- `volunteersApi.interviewPlan(id, refresh?)`, `saveInterviewResult(interviewId, data)`, `dashboardToday()`,
  `dashboardAnalytics()`;
- `mock.ts`: правдоподобные данные — сводка со всеми непустыми блоками, воронка с заметным отвалом школьников,
  дефицит в «будни утро», 12 недель активности, 2–3 «засыпающих»; план считается моком по правилам фолбэка.
- `labels.ts`: `DECISION`, `FUNNEL_STEP` — подписи по-русски.

## 7. Демо-данные

`scripts/seed.py` (через API, как сейчас) на пустой базе дополнительно создаёт:
- ~10 прошедших занятий за 12 недель (из нового `data/demo/past_opportunities.json`) и участия с `attended`
  у ~15 волонтёров — неровно, чтобы на графике были пики и провалы и чтобы появились «засыпающие»;
- 6–8 собеседований: часть `done` с итогами (разные решения), 1–2 на сегодня, 1 просроченное без итога;
- статусы так, чтобы воронка выглядела живой (школьники в основном останавливаются на `applied`/`interviewed`).

Прошедшие занятия создаются через `POST /opportunities` с датой в прошлом — эндпоинт это уже допускает
(проверки на будущее время нет).

## 8. Экраны для B (отдельный Issue)

- **«Сводка»** (`/admin`, главный экран, расширяет T-55): счётчики сверху; карточки-списки «Собеседования
  сегодня» (кнопка «Открыть звонок» → `/call/<token>?as=coordinator`), «Ждут знакомства», «Ждут допуска»,
  «Отклики без ответа», «Не хватает людей». Пустой блок — короткая фраза «Всё разобрано».
- **«Аналитика»** (`/admin/analytics`): воронка (горизонтальные полосы, переключатель «все / по занятости»),
  спрос и предложение (парные столбики по 4 слотам и по регионам, дефицит подсвечен), часы по неделям
  (столбики), топ-5 и «засыпающие» со ссылкой на карточку.
- **Карточка волонтёра** (T-60): блок «Собеседование» — назначить, список, «Открыть звонок», «План» (вопросы
  и «на что обратить внимание», кнопка «Обновить»), форма «Итог» (три оценки 1–5 крупными кнопками, решение, роли
  чипсами, комментарий), итог в списке.
- **Звонок у координатора** (`CallScreen`, `?as=coordinator`): сбоку или снизу — план, после «Завершить» — форма
  итога. Имя на странице звонка по-прежнему не показываем.
- **«Я» у волонтёра**: шаги пути с текущим, ближайшее собеседование с крупной «Войти в звонок».
- Графики — SVG/CSS без библиотек, цвета только из токенов `index.css`.

## Ошибки и устойчивость

- LLM — с таймаутом клиента; любая ошибка плана → фолбэк, экран не ломается.
- Дашборды LLM не зовут вообще.
- 404 для неизвестных волонтёра и собеседования, 409 для итога отменённого, 422 для оценок и ролей.

## Тесты (`backend/tests/`, провайдер `fake`)

- `test_interview_plan.py`: план строится и кэшируется (второй запрос отдаёт тот же `created_at`); `refresh`
  перестраивает; при ошибке LLM — фолбэк с правилами (школьник получает вопрос про баллы), `ai=False`, не кэшируется;
  имени и контакта нет в промпте; 404.
- `test_interviews.py` (дополнить): итог сохраняется и ставит `done`, перезаписывается, виден в списке; 409 для
  отменённого; 422 для оценки 0 и неизвестной роли.
- `test_dashboard.py`: маленькая база с известными цифрами и фиксированным `now` — каждый блок «сегодня»,
  шаги воронки и разрез, спрос/предложение по слоту и региону (включая онлайн), недели с нулями, топ, «засыпающие».
