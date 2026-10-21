# Кабинет координатора (T-66, бэкенд) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** бэкенд, контракт и моки для кабинета координатора: AI-план и итог собеседования, `GET /dashboard/today`,
`GET /dashboard/analytics` и демо-история, чтобы напарник (T-69) рисовал экраны на готовых данных.

**Architecture:** две новые таблицы (`InterviewPlan`, `InterviewResult`) рядом с `Interview` — без миграций,
`create_all` создаёт их сам. План — LLM через `chat_json` с фолбэком по правилам; дашборды — чистый Python по
выборкам из БД в `services/dashboard.py`, HTTP — тонкие обёртки. Контракт `schemas.py` ↔ `api.ts` + `mock.ts`
в одном PR.

**Tech Stack:** FastAPI, SQLModel (SQLite), pydantic v2, pytest на провайдере `fake`; React + TypeScript (только
`api.ts`, `mock.ts`, `labels.ts`).

**Спека:** [docs/superpowers/specs/2026-10-21-coordinator-cabinet-design.md](../specs/2026-10-21-coordinator-cabinet-design.md)

**Ветка:** `a/T-66-cabinet` (уже создана, в ней спека). Все команды — из корня репозитория в Git Bash.

---

## Карта файлов

| Файл | Что делаем |
|---|---|
| `backend/app/models.py` | + таблицы `InterviewPlan`, `InterviewResult` |
| `backend/app/schemas.py` | + `PlanQuestion`, `InterviewPlan`, `Decision`, `InterviewResultIn`, `InterviewResult`, `Interview.result`; + схемы дашбордов |
| `backend/app/services/interviews.py` | + `save_result`, `to_out` |
| `backend/app/services/interview_plan.py` | новый: план собеседования (LLM + фолбэк + кэш) |
| `backend/app/llm/prompts/interview_plan.md` | новый промпт с few-shot |
| `backend/app/services/dashboard.py` | новый: `today`, `analytics`, `local_now` |
| `backend/app/api/interviews.py` | + `GET /volunteers/{id}/interview-plan`, `PUT /interviews/{id}/result`; ответы через `to_out` |
| `backend/app/api/dashboard.py` | новый: `GET /dashboard/today`, `GET /dashboard/analytics` |
| `backend/app/main.py` | подключить роутер `dashboard` |
| `backend/tests/test_interviews.py` | + тесты итога |
| `backend/tests/test_interview_plan.py` | новый |
| `backend/tests/test_dashboard.py` | новый |
| `backend/tests/test_demo_data.py` | + проверка `history.json` |
| `miniapp/src/api.ts` | типы и методы контракта, `PUT` в `request()` |
| `miniapp/src/labels.ts` | `DECISION`, `FUNNEL_STEP` |
| `miniapp/src/mock.ts` | моки плана, итога, сводки, аналитики |
| `data/demo/history.json` | новый: статусы, прошедшие занятия, отклики, собеседования |
| `scripts/seed.py` | + `seed_history()` |
| `docs/CASE.md` | строка «Рабочее пространство» — про сводку и аналитику |

---

### Task 1: Итог собеседования

**Files:**
- Modify: `backend/app/models.py` (после класса `Interview`)
- Modify: `backend/app/schemas.py` (блок собеседования, перед `class Interview`)
- Modify: `backend/app/services/interviews.py`
- Modify: `backend/app/api/interviews.py`
- Test: `backend/tests/test_interviews.py`

- [ ] **Step 1: Написать падающие тесты** — дописать в конец `backend/tests/test_interviews.py`:

```python
RESULT = {
    "motivation": 5,
    "readiness": 4,
    "regularity": 3,
    "decision": "next",
    "roles": ["photographer"],
    "comment": "Снимает на свою камеру, готова по субботам",
}


def test_new_interview_has_no_result(client):
    interview = schedule(client, create_volunteer(client))
    assert interview["result"] is None


def test_result_saved_marks_done_and_can_be_corrected(client):
    volunteer_id = create_volunteer(client)
    interview = schedule(client, volunteer_id)

    r = client.put(f"/interviews/{interview['id']}/result", json=RESULT)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "done"
    assert body["result"]["decision"] == "next"
    assert body["result"]["roles"] == ["photographer"]

    # координатор поправил итог — перезаписываем, а не создаём второй
    r = client.put(
        f"/interviews/{interview['id']}/result", json={**RESULT, "decision": "think", "roles": []}
    )
    assert r.status_code == 200, r.text
    listed = client.get(f"/volunteers/{volunteer_id}/interviews").json()
    assert listed[0]["result"]["decision"] == "think"
    assert listed[0]["result"]["roles"] == []


def test_result_errors(client):
    interview = schedule(client, create_volunteer(client))
    url = f"/interviews/{interview['id']}/result"
    assert client.put("/interviews/999/result", json=RESULT).status_code == 404
    assert client.put(url, json={**RESULT, "motivation": 0}).status_code == 422
    r = client.put(url, json={**RESULT, "roles": ["astronaut"]})
    assert r.status_code == 422
    assert "astronaut" in r.json()["detail"]

    client.patch(f"/interviews/{interview['id']}", json={"status": "canceled"})
    r = client.put(url, json=RESULT)
    assert r.status_code == 409
    assert "отменено" in r.json()["detail"]
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `uv run pytest backend/tests/test_interviews.py -v -k result`
Expected: FAIL — `KeyError: 'result'` и 405 Method Not Allowed для `PUT`.

- [ ] **Step 3: Таблица** — в `backend/app/models.py` после класса `Interview`:

```python
class InterviewResult(SQLModel, table=True):
    """Итог собеседования (T-66). Как и заметки — только для фонда: в LLM и в индекс не уходит."""

    interview_id: int = Field(foreign_key="interview.id", primary_key=True)
    created_at: datetime = Field(default_factory=_now)  # когда сохранили последний раз
    motivation: int  # 1–5
    readiness: int  # 1–5, готовность к работе с подопечными
    regularity: int  # 1–5, насколько надёжно будет приходить
    decision: str  # schemas.Decision
    roles: list[str] = Field(sa_column=Column(JSON, nullable=False))  # коды из data/roles.json
    comment: str = ""
```

- [ ] **Step 4: Схемы** — в `backend/app/schemas.py` перед `class Interview(BaseModel)` вставить:

```python
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
```

и в `class Interview(BaseModel)` последней строкой добавить поле:

```python
    result: InterviewResult | None = None  # итог после звонка; волонтёру не показываем
```

- [ ] **Step 5: Сервис** — в `backend/app/services/interviews.py`:

заменить импорты моделей и схем на

```python
from datetime import UTC, datetime

from app.models import Interview, InterviewResult, Volunteer
from app.schemas import IceServer, InterviewResultIn, InterviewStatus
from app.schemas import Interview as InterviewOut
from app.schemas import InterviewResult as InterviewResultOut
```

(строку `from datetime import datetime` убрать — её заменяет первая строка) и после `update_status` добавить:

```python
def save_result(session: Session, interview: Interview, data: InterviewResultIn) -> Interview:
    """Итог перезаписывается — координатор может поправить. Собеседование становится «прошло»,
    статус волонтёра не трогаем: что дальше, решает человек."""
    result = session.get(InterviewResult, interview.id)
    if result is None:
        result = InterviewResult(interview_id=interview.id, **data.model_dump())
    else:
        for field, value in data.model_dump().items():
            setattr(result, field, value)
        result.created_at = datetime.now(UTC)
    interview.status = "done"
    session.add(result)
    session.add(interview)
    session.commit()
    session.refresh(interview)
    return interview


def to_out(session: Session, interview: Interview) -> InterviewOut:
    """Собеседование для ответа API — вместе с итогом, если он есть."""
    result = session.get(InterviewResult, interview.id)
    return InterviewOut(
        **interview.model_dump(),
        result=InterviewResultOut.model_validate(result, from_attributes=True) if result else None,
    )
```

- [ ] **Step 6: HTTP** — `backend/app/api/interviews.py` целиком:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.models import Interview as InterviewRow
from app.models import Volunteer
from app.schemas import Interview, InterviewIn, InterviewResultIn, InterviewUpdate
from app.services import interviews, volunteers
from app.services.roles import load_roles

router = APIRouter(tags=["interviews"])


def _volunteer_or_404(session: Session, volunteer_id: int) -> Volunteer:
    volunteer = volunteers.get(session, volunteer_id)
    if volunteer is None:
        raise HTTPException(404, f"Волонтёр {volunteer_id} не найден")
    return volunteer


def _interview_or_404(session: Session, interview_id: int) -> InterviewRow:
    interview = interviews.get(session, interview_id)
    if interview is None:
        raise HTTPException(404, f"Собеседование {interview_id} не найдено")
    return interview


@router.post("/volunteers/{volunteer_id}/interviews", response_model=Interview)
def create(
    volunteer_id: int, data: InterviewIn, session: Session = Depends(get_session)
) -> Interview:
    """Координатор назначает видеособеседование; волонтёру уходит ссылка в Telegram."""
    volunteer = _volunteer_or_404(session, volunteer_id)
    return interviews.to_out(session, interviews.create(session, volunteer, data.starts_at))


@router.get("/volunteers/{volunteer_id}/interviews", response_model=list[Interview])
def list_for_volunteer(volunteer_id: int, session: Session = Depends(get_session)) -> list[Interview]:
    """Собеседования волонтёра — для карточки в /admin и для раздела «Я»."""
    volunteer = _volunteer_or_404(session, volunteer_id)
    return [interviews.to_out(session, i) for i in interviews.for_volunteer(session, volunteer)]


@router.patch("/interviews/{interview_id}", response_model=Interview)
def update(
    interview_id: int, data: InterviewUpdate, session: Session = Depends(get_session)
) -> Interview:
    """done — прошло, canceled — отменить (ссылка перестаёт работать)."""
    interview = _interview_or_404(session, interview_id)
    return interviews.to_out(session, interviews.update_status(session, interview, data.status))


@router.put("/interviews/{interview_id}/result", response_model=Interview)
def save_result(
    interview_id: int, data: InterviewResultIn, session: Session = Depends(get_session)
) -> Interview:
    """Итог после звонка: оценки, решение, подходящие роли. Ставит собеседованию «прошло»."""
    interview = _interview_or_404(session, interview_id)
    if interview.status == "canceled":
        raise HTTPException(409, "Собеседование отменено — итог не сохраняем")
    known = {r.code for r in load_roles()}
    unknown = [code for code in data.roles if code not in known]
    if unknown:
        raise HTTPException(422, f"Неизвестные роли: {', '.join(unknown)}")
    return interviews.to_out(session, interviews.save_result(session, interview, data))
```

- [ ] **Step 7: Запустить тесты собеседований**

Run: `uv run pytest backend/tests/test_interviews.py -v`
Expected: все PASS (старые тоже — `result` у них `None`).

- [ ] **Step 8: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/services/interviews.py backend/app/api/interviews.py backend/tests/test_interviews.py
git commit -m "T-66: итог собеседования — оценки, решение, роли (PUT /interviews/{id}/result)"
```

---

### Task 2: AI-план собеседования

**Files:**
- Modify: `backend/app/models.py` (после `InterviewResult`)
- Modify: `backend/app/schemas.py` (перед `Decision`)
- Create: `backend/app/llm/prompts/interview_plan.md`
- Create: `backend/app/services/interview_plan.py`
- Modify: `backend/app/api/interviews.py`
- Test: `backend/tests/test_interview_plan.py`

- [ ] **Step 1: Написать падающие тесты** — `backend/tests/test_interview_plan.py`:

```python
"""AI-план собеседования: вопросы под анкету, кэш, фолбэк без LLM, никаких ПД в промпте."""

import pytest

from app.llm.client import get_llm
from app.llm.providers import FakeProvider, LLMError

MARKER = "готовишь координатора"  # фраза из промпта interview_plan.md

FORM = {
    "name": "Миша Планов",
    "contact": "+7 900 000-00-66",
    "answers": {
        "about": "Учусь в 9 классе, люблю рисовать",
        "occupation": "schoolkid",
        "availability": ["weekend"],
    },
}


class RecordingProvider(FakeProvider):
    """Fake, который запоминает промпты плана собеседования."""

    def __init__(self):
        self.prompts: list[str] = []

    def complete(self, messages):
        text = "\n".join(m["content"] for m in messages)
        if MARKER in text:
            self.prompts.append(text)
        return super().complete(messages)


class BrokenProvider(FakeProvider):
    def complete(self, messages):
        text = "\n".join(m["content"] for m in messages)
        if MARKER in text:
            raise LLMError("модель недоступна")
        return super().complete(messages)


@pytest.fixture
def llm():
    client = get_llm()
    client.provider = RecordingProvider()
    return client


@pytest.fixture
def volunteer_id(client, llm) -> int:
    r = client.post("/volunteers", json=FORM)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_plan_is_built_once_and_cached(client, llm, volunteer_id):
    first = client.get(f"/volunteers/{volunteer_id}/interview-plan")
    assert first.status_code == 200, first.text
    plan = first.json()
    assert plan["ai"] is True
    assert plan["volunteer_id"] == volunteer_id
    assert plan["questions"] and plan["questions"][0]["question"]

    second = client.get(f"/volunteers/{volunteer_id}/interview-plan").json()
    assert second == plan  # тот же план — вопросы не меняются во время звонка
    assert len(llm.provider.prompts) == 1


def test_refresh_builds_again(client, llm, volunteer_id):
    client.get(f"/volunteers/{volunteer_id}/interview-plan")
    r = client.get(f"/volunteers/{volunteer_id}/interview-plan?refresh=true")
    assert r.status_code == 200
    assert len(llm.provider.prompts) == 2


def test_no_personal_data_in_prompt(client, llm, volunteer_id):
    client.get(f"/volunteers/{volunteer_id}/interview-plan")
    prompt = llm.provider.prompts[0]
    assert FORM["name"] not in prompt
    assert FORM["contact"] not in prompt
    assert "люблю рисовать" in prompt  # ответы анкеты — можно


def test_fallback_by_rules_is_not_cached(client, llm, volunteer_id):
    llm.provider = BrokenProvider()
    plan = client.get(f"/volunteers/{volunteer_id}/interview-plan").json()
    assert plan["ai"] is False
    texts = " ".join(q["question"] for q in plan["questions"])
    assert "баллы" in texts  # школьник: часто приходят ради баллов
    assert "особыми ребятами" in texts  # опыта в анкете нет

    llm.provider = RecordingProvider()
    again = client.get(f"/volunteers/{volunteer_id}/interview-plan").json()
    assert again["ai"] is True  # фолбэк не сохранили — LLM попробовали снова


def test_plan_404(client):
    assert client.get("/volunteers/999/interview-plan").status_code == 404
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `uv run pytest backend/tests/test_interview_plan.py -v`
Expected: FAIL — 404 Not Found на `/interview-plan` (эндпоинта нет).

- [ ] **Step 3: Таблица** — в `backend/app/models.py` после `InterviewResult`:

```python
class InterviewPlan(SQLModel, table=True):
    """AI-план собеседования (T-66). Хранится, чтобы вопросы не менялись во время звонка.
    Зависит только от анкеты, поэтому один на волонтёра."""

    volunteer_id: int = Field(foreign_key="volunteer.id", primary_key=True)
    created_at: datetime = Field(default_factory=_now)
    questions: list[dict[str, Any]] = Field(sa_column=Column(JSON, nullable=False))  # schemas.PlanQuestion
    focus: list[str] = Field(sa_column=Column(JSON, nullable=False))
```

- [ ] **Step 4: Схемы** — в `backend/app/schemas.py` перед строкой `Decision = Literal[...]`:

```python
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
```

- [ ] **Step 5: Промпт** — `backend/app/llm/prompts/interview_plan.md`:

```markdown
Ты готовишь координатора благотворительного фонда «Дети Марии» к короткому видеособеседованию с новым волонтёром.
Фонд проводит творческие мастерские (керамика, живопись, валяние, кулинария) для детей-сирот и взрослых
с ментальными особенностями. Волонтёры помогают на занятиях, сопровождают группы, бывают разовые задачи
(съёмка, ярмарка, дорога).

По ответам анкеты составь план беседы:
- questions — от 5 до 7 вопросов. Простыми словами, на «вы», без канцелярита. Каждый вопрос — про то,
  что в анкете неясно, рискованно или важно для работы с подопечными. why — одной фразой, что уточняем.
- focus — от 1 до 3 коротких пунктов «на что обратить внимание» координатору.
- Если человек школьник — уточни, не ради ли баллов он пришёл и сколько раз готов прийти.
- Если опыта с детьми или людьми с особенностями нет — спроси, как он представляет занятие.
- Не придумывай факты о человеке, которых нет в анкете. Не спрашивай о здоровье, религии, политике и доходах.

Пример.
Анкета:
О себе: Пенсионерка, 40 лет проработала швеёй
Умеет: шитьё, вязание
Хочет: учить детей шить
Опыт: —
Когда свободен: будни утром, будни днём
Занятость: Пенсионер
Регион: Москва
Профиль: навыки — шитьё, вязание; подходящие роли — workshop_assistant
Ответ: {"questions": [
{"question": "Что вам больше нравится: вести занятие самой или помогать педагогу?", "why": "Понять роль: ведущая или помощник"},
{"question": "Приходилось ли вам заниматься с детьми, которым трудно сосредоточиться?", "why": "Опыта с особыми детьми в анкете нет"},
{"question": "Как вы поступите, если ребёнок расстроится и бросит работу?", "why": "Готовность к трудным ситуациям на занятии"},
{"question": "Удобно ли вам добираться до мастерских на Дмитровском переулке?", "why": "Дорога для пенсионера — частая причина пропусков"},
{"question": "Сколько раз в месяц вам комфортно приходить?", "why": "Сверить ожидания по регулярности"}
], "focus": ["Сильный навык шитья — подходит для мастерских", "Нет опыта с особыми детьми — рассказать, как проходят занятия"]}

Анкета:
$answers
Профиль: $profile
```

- [ ] **Step 6: Сервис** — `backend/app/services/interview_plan.py`:

```python
"""AI-план собеседования (T-66): вопросы под конкретную анкету.

В LLM уходят только ответы анкеты и профиль — без имени, контакта и заметок (152-ФЗ).
Готовый план хранится в таблице InterviewPlan, чтобы вопросы не менялись во время звонка.
LLM недоступен — базовые вопросы и правила по анкете; такой план не сохраняем, в следующий раз пробуем LLM.
"""

import logging
from datetime import UTC, datetime

from pydantic import BaseModel, Field
from sqlmodel import Session

from app.llm.client import get_llm
from app.llm.prompts import load_prompt
from app.llm.providers import LLMError
from app.models import InterviewPlan as PlanRow
from app.models import Volunteer
from app.schemas import Answers, InterviewPlan, PlanQuestion, Profile
from app.services.volunteers import answers_text

log = logging.getLogger(__name__)


class GeneratedPlan(BaseModel):
    """Ответ LLM: вопросы и на что обратить внимание."""

    questions: list[PlanQuestion] = Field(min_length=1, max_length=8)
    focus: list[str] = Field(default_factory=list, max_length=3)


BASE_QUESTIONS = [
    PlanQuestion(
        question="Почему вы хотите помогать именно нашему фонду?", why="Понять мотивацию"
    ),
    PlanQuestion(
        question="Был ли у вас опыт общения с детьми или взрослыми с особенностями развития?",
        why="Готовность к работе с подопечными",
    ),
    PlanQuestion(
        question="Что вы сделаете, если на занятии станет тяжело или непонятно, как себя вести?",
        why="Как человек справляется с трудными ситуациями",
    ),
    PlanQuestion(
        question="Как часто у вас реально получится приходить?",
        why="Сверить ожидания по регулярности",
    ),
]


def get_or_build(session: Session, volunteer: Volunteer, refresh: bool = False) -> InterviewPlan:
    """Сохранённый план или новый. refresh — составить заново (старый остаётся, если LLM не ответил)."""
    row = session.get(PlanRow, volunteer.id)
    if row is not None and not refresh:
        return _out(row)
    generated = generate(volunteer)
    if generated is None:
        if row is not None:
            return _out(row)
        plan = fallback(Answers.model_validate(volunteer.answers))
        return InterviewPlan(
            volunteer_id=volunteer.id, **plan.model_dump(), ai=False, created_at=datetime.now(UTC)
        )
    if row is None:
        row = PlanRow(volunteer_id=volunteer.id, questions=[], focus=[])
    row.questions = [q.model_dump() for q in generated.questions]
    row.focus = list(generated.focus)
    row.created_at = datetime.now(UTC)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _out(row)


def generate(volunteer: Volunteer) -> GeneratedPlan | None:
    """LLM составляет план по анкете. None — модель недоступна или дважды ответила мусором."""
    prompt = load_prompt(
        "interview_plan",
        answers=answers_text(Answers.model_validate(volunteer.answers)),
        profile=profile_text(volunteer.profile),
    )
    try:
        return get_llm().chat_json(prompt, GeneratedPlan, system=load_prompt("system"))
    except LLMError as e:
        log.warning("План собеседования без LLM: %s", e)
        return None


def profile_text(profile: dict | None) -> str:
    if not profile:
        return "ещё не построен"
    p = Profile.model_validate(profile)
    return (
        f"навыки — {', '.join(p.skills) or 'нет'}; интересы — {', '.join(p.interests) or 'нет'}; "
        f"подходящие роли — {', '.join(p.suitable_roles) or 'нет'}"
    )


def fallback(answers: Answers) -> GeneratedPlan:
    """Базовые вопросы + правила по анкете — если LLM недоступен."""
    questions = list(BASE_QUESTIONS)
    focus = []
    if answers.occupation == "schoolkid":
        questions.append(
            PlanQuestion(
                question="Нужны ли вам часы или баллы для школы? Сколько занятий планируете?",
                why="Школьники часто приходят ради баллов и пропадают",
            )
        )
        focus.append("Школьник — проверить, готов ли прийти больше одного раза")
    if not answers.experience.strip():
        questions.append(
            PlanQuestion(
                question="Как вы представляете занятие с особыми ребятами?",
                why="Опыта в анкете нет",
            )
        )
        focus.append("Нет опыта — рассказать, как проходят занятия")
    if answers.occupation == "pensioner":
        questions.append(
            PlanQuestion(
                question="Удобно ли вам добираться? Сколько времени комфортно провести на занятии?",
                why="Силы и дорога — частые причины пропусков",
            )
        )
    if answers.regularity == "regular":
        questions.append(
            PlanQuestion(
                question="Готовы ли вы ходить к одной группе несколько месяцев?",
                why="Постоянным группам важны одни и те же взрослые",
            )
        )
    return GeneratedPlan(questions=questions, focus=focus)


def _out(row: PlanRow) -> InterviewPlan:
    return InterviewPlan(
        volunteer_id=row.volunteer_id,
        questions=row.questions,
        focus=row.focus,
        ai=True,
        created_at=row.created_at,
    )
```

(4 базовых + не больше 4 правил = не больше 8 вопросов, `max_length=8` не нарушается.)

- [ ] **Step 7: HTTP** — в `backend/app/api/interviews.py`:

в импорт схем добавить `InterviewPlan`, в импорт сервисов — `interview_plan`:

```python
from app.schemas import Interview, InterviewIn, InterviewPlan, InterviewResultIn, InterviewUpdate
from app.services import interview_plan, interviews, volunteers
```

и после `list_for_volunteer` добавить:

```python
@router.get("/volunteers/{volunteer_id}/interview-plan", response_model=InterviewPlan)
def plan(
    volunteer_id: int, refresh: bool = False, session: Session = Depends(get_session)
) -> InterviewPlan:
    """Вопросы к собеседованию под анкету (в LLM — только ответы анкеты). refresh=true — заново."""
    volunteer = _volunteer_or_404(session, volunteer_id)
    return interview_plan.get_or_build(session, volunteer, refresh)
```

- [ ] **Step 8: Запустить тесты**

Run: `uv run pytest backend/tests/test_interview_plan.py backend/tests/test_interviews.py -v`
Expected: все PASS.

Если `test_plan_is_built_once_and_cached` падает на `second == plan` из-за `created_at` (у свежей строки дата
с часовым поясом, у прочитанной из SQLite — без): в `_out` нормализовать `created_at=row.created_at.replace(tzinfo=None)`
— и в `get_or_build` для фолбэка тоже `datetime.now(UTC).replace(tzinfo=None)`.

- [ ] **Step 9: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/llm/prompts/interview_plan.md backend/app/services/interview_plan.py backend/app/api/interviews.py backend/tests/test_interview_plan.py
git commit -m "T-66: AI-план собеседования — вопросы под анкету, кэш и фолбэк по правилам"
```

---

### Task 3: Дашборд «что сегодня»

**Files:**
- Modify: `backend/app/schemas.py` (в конец файла)
- Create: `backend/app/services/dashboard.py`
- Create: `backend/app/api/dashboard.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_dashboard.py`

- [ ] **Step 1: Написать падающие тесты** — `backend/tests/test_dashboard.py`:

```python
"""Дашборды кабинета координатора на маленькой базе с известными цифрами.

NOW — среда 21 октября 2026, 12:00. Данные пишем прямо в БД, чтобы задать даты в прошлом.
"""

from datetime import datetime, timedelta

import pytest
from sqlmodel import Session

from app.db import get_engine, init_db
from app.models import Interview, InterviewResult, Opportunity, Participation, Volunteer
from app.services import dashboard

NOW = datetime(2026, 10, 21, 12, 0)


def add(session: Session, row):
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def volunteer(session, name, status="new", hours=0.0, days_ago=1, **answers) -> Volunteer:
    answers = {
        "about": "демо",
        "occupation": "other",
        "region": "moscow",
        "formats": ["offline"],
        "availability": [],
        **answers,
    }
    return add(
        session,
        Volunteer(
            name=name,
            contact="+7 900 000-00-00",
            answers=answers,
            status=status,
            hours=hours,
            created_at=NOW - timedelta(days=days_ago),
        ),
    )


def opportunity(session, starts_at, slots=1, hours=3.0, **changes) -> Opportunity:
    return add(
        session,
        Opportunity(title=f"Занятие {starts_at:%d.%m}", starts_at=starts_at, slots=slots, hours=hours, **changes),
    )


def participation(session, o, v, status, hours=0.0) -> Participation:
    return add(session, Participation(opportunity_id=o.id, volunteer_id=v.id, status=status, hours=hours))


def interview(session, v, starts_at, status="scheduled") -> Interview:
    return add(session, Interview(volunteer_id=v.id, starts_at=starts_at, status=status, token=f"t{v.id}{status}"))


@pytest.fixture
def db():
    """Семь волонтёров, четыре занятия, четыре собеседования — на каждый блок дашборда."""
    init_db()
    with Session(get_engine()) as s:
        new_old = volunteer(s, "Ждёт давно", days_ago=5, occupation="schoolkid")
        booked = volunteer(s, "Назначено сегодня")
        overdue = volunteer(s, "Просрочено")
        trained = volunteer(s, "Прошёл обучение", status="trained")
        active = volunteer(s, "Активная", status="active", hours=3, availability=["weekday_morning"])
        sleepy = volunteer(s, "Ни разу", status="approved", availability=["weekend"])
        old = volunteer(s, "Давно был", status="approved", hours=2, formats=["offline", "online"])

        past = opportunity(s, NOW - timedelta(days=10, hours=2), slots=3)  # вс 11 октября, 10:00
        participation(s, past, active, "attended", hours=3)
        long_ago = opportunity(s, NOW - timedelta(days=100), hours=2)
        participation(s, long_ago, old, "attended", hours=2)
        soon = opportunity(s, datetime(2026, 10, 23, 10, 0), slots=3)  # пт, будни утро, Москва очно
        participation(s, soon, active, "confirmed")
        online = opportunity(s, datetime(2026, 11, 10, 18, 0), slots=2, format="online", region="other")
        participation(s, online, sleepy, "responded")

        interview(s, booked, datetime(2026, 10, 21, 15, 0))
        interview(s, overdue, datetime(2026, 10, 20, 15, 0))
        interview(s, new_old, datetime(2026, 10, 21, 16, 0), status="canceled")
        done = interview(s, trained, datetime(2026, 10, 10, 15, 0), status="done")
        add(s, InterviewResult(interview_id=done.id, motivation=5, readiness=4, regularity=4, decision="next", roles=[]))
        yield s


def names(items) -> list[str]:
    return [i.volunteer.name for i in items]


def test_today_interviews_overdue_first(db):
    today = dashboard.today(db, NOW)
    assert names(today.interviews) == ["Просрочено", "Назначено сегодня"]
    assert [i.overdue for i in today.interviews] == [True, False]


def test_today_waiting_lists(db):
    today = dashboard.today(db, NOW)
    assert names(today.new_without_interview) == ["Ждёт давно"]  # отменённое не считается
    assert today.new_without_interview[0].days == 5
    assert names(today.awaiting_approval) == ["Прошёл обучение"]
    assert [(p.volunteer.name, p.opportunity_title) for p in today.pending_responses] == [
        ("Ни разу", "Занятие 10.11")
    ]


def test_today_understaffed_and_counters(db):
    today = dashboard.today(db, NOW)
    assert [(u.title, u.taken, u.missing) for u in today.understaffed] == [("Занятие 23.10", 1, 2)]
    c = today.counters
    assert (c.volunteers, c.active, c.hours_total, c.hours_month) == (7, 1, 5, 3)


def test_today_api(client):
    r = client.get("/dashboard/today")
    assert r.status_code == 200, r.text
    assert r.json()["counters"]["volunteers"] == 0
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `uv run pytest backend/tests/test_dashboard.py -v`
Expected: FAIL — `ImportError: cannot import name 'dashboard'`.

- [ ] **Step 3: Схемы** — в конец `backend/app/schemas.py`:

```python
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
```

- [ ] **Step 4: Сервис** — `backend/app/services/dashboard.py`:

```python
"""Дашборды кабинета координатора (T-66): «что сегодня» и аналитика.

LLM здесь не нужен. Всё считаем в Python по выборкам из БД: в базе фонда сотни записей, так проще читать.
Дата участия — начало занятия: у участия нет даты «участвовал», а дата занятия честнее.
Время везде местное (московское), без часового пояса — как starts_at у занятий и собеседований.
"""

from datetime import datetime, time, timedelta, timezone

from sqlalchemy import func
from sqlmodel import Session, select

from app.models import Interview, Opportunity, Participation, QuizAttempt, Volunteer
from app.schemas import (
    Counters,
    DashboardToday,
    PendingResponse,
    TodayInterview,
    Understaffed,
    VolunteerRef,
    WaitingVolunteer,
)
from app.services.volunteers import training_score

MSK = timezone(timedelta(hours=3), "MSK")  # фонд работает по Москве; летнего времени нет
ACTIVE_DAYS = 60  # «активен» — участвовал за столько дней
UNDERSTAFFED_DAYS = 7  # «не хватает людей» — смотрим на неделю вперёд
TAKEN = ("confirmed", "attended")  # как в каталоге возможностей


def local_now() -> datetime:
    """Сейчас по Москве, без часового пояса — так хранятся starts_at."""
    return datetime.now(MSK).replace(tzinfo=None)


class Data:
    """Всё нужное для дашбордов одной выборкой."""

    def __init__(self, session: Session):
        self.volunteers = list(session.exec(select(Volunteer).order_by(Volunteer.id)).all())
        self.opportunities = {o.id: o for o in session.exec(select(Opportunity)).all()}
        self.participations = list(session.exec(select(Participation)).all())
        self.interviews = list(session.exec(select(Interview)).all())
        self.ref = {v.id: VolunteerRef(id=v.id, name=v.name) for v in self.volunteers}

    def attended(self) -> list[tuple[Participation, Opportunity]]:
        return [
            (p, self.opportunities[p.opportunity_id])
            for p in self.participations
            if p.status == "attended"
        ]

    def taken(self, opportunity_id: int) -> int:
        return sum(
            p.opportunity_id == opportunity_id and p.status in TAKEN for p in self.participations
        )


def today(session: Session, now: datetime) -> DashboardToday:
    data = Data(session)
    end_of_day = datetime.combine(now.date(), time.max)

    interviews = [
        TodayInterview(
            interview_id=i.id,
            volunteer=data.ref[i.volunteer_id],
            starts_at=i.starts_at,
            token=i.token,
            overdue=i.starts_at < now,
        )
        for i in sorted(data.interviews, key=lambda i: i.starts_at)
        if i.status == "scheduled" and i.starts_at <= end_of_day
    ]

    booked = {i.volunteer_id for i in data.interviews if i.status != "canceled"}
    new_without_interview = sorted(
        (
            waiting(data.ref[v.id], naive(v.created_at), now)
            for v in data.volunteers
            if v.status == "new" and v.id not in booked
        ),
        key=lambda w: w.since,
    )

    last_quiz = dict(
        session.exec(
            select(QuizAttempt.volunteer_id, func.max(QuizAttempt.created_at)).group_by(
                QuizAttempt.volunteer_id
            )
        ).all()
    )
    awaiting_approval = sorted(
        (
            waiting(
                data.ref[v.id],
                naive(last_quiz.get(v.id) or v.created_at),
                now,
                training_score(session, v.id),
            )
            for v in data.volunteers
            if v.status == "trained"
        ),
        key=lambda w: w.since,
    )

    upcoming = sorted(
        (o for o in data.opportunities.values() if o.starts_at >= now), key=lambda o: o.starts_at
    )
    pending_responses = [
        PendingResponse(
            participation_id=p.id,
            opportunity_id=o.id,
            opportunity_title=o.title,
            starts_at=o.starts_at,
            volunteer=data.ref[p.volunteer_id],
        )
        for o in upcoming
        for p in data.participations
        if p.opportunity_id == o.id and p.status == "responded"
    ]

    week_end = now + timedelta(days=UNDERSTAFFED_DAYS)
    understaffed = []
    for o in upcoming:
        taken = data.taken(o.id)
        if o.starts_at <= week_end and taken < o.slots:
            understaffed.append(
                Understaffed(
                    opportunity_id=o.id,
                    title=o.title,
                    starts_at=o.starts_at,
                    slots=o.slots,
                    taken=taken,
                    missing=o.slots - taken,
                )
            )

    return DashboardToday(
        interviews=interviews,
        new_without_interview=new_without_interview,
        awaiting_approval=awaiting_approval,
        pending_responses=pending_responses,
        understaffed=understaffed,
        counters=counters(data, now),
    )


def counters(data: Data, now: datetime) -> Counters:
    active_since = now - timedelta(days=ACTIVE_DAYS)
    month_start = datetime.combine(now.date().replace(day=1), time.min)
    attended = [(p, o) for p, o in data.attended() if o.starts_at <= now]
    return Counters(
        volunteers=len(data.volunteers),
        active=len({p.volunteer_id for p, o in attended if o.starts_at >= active_since}),
        # сумма из базы: координатор может поправить часы вручную — цифра совпадёт с карточкой
        hours_total=sum(v.hours for v in data.volunteers),
        hours_month=sum(p.hours for p, o in attended if o.starts_at >= month_start),
    )


def waiting(
    ref: VolunteerRef, since: datetime, now: datetime, score: int | None = None
) -> WaitingVolunteer:
    return WaitingVolunteer(
        volunteer=ref, since=since, days=max(0, (now - since).days), training_score=score
    )


def naive(value: datetime) -> datetime:
    """created_at пишется с часовым поясом UTC, а из SQLite читается без него — приводим к одному виду."""
    return value.replace(tzinfo=None)
```

- [ ] **Step 5: HTTP** — `backend/app/api/dashboard.py`:

```python
"""Дашборды кабинета координатора (T-66): тонкие обёртки над services/dashboard.py."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.schemas import DashboardToday
from app.services import dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/today", response_model=DashboardToday)
def today(session: Session = Depends(get_session)) -> DashboardToday:
    """Что требует внимания сегодня: собеседования, новые анкеты, допуск, отклики, нехватка людей."""
    return dashboard.today(session, dashboard.local_now())
```

- [ ] **Step 6: Подключить роутер** — в `backend/app/main.py` добавить `dashboard,` в импорт `from app.api import (...)`
(по алфавиту, после `chat,`) и `dashboard,` в кортеж `for module in (...)` после `interviews,`.

- [ ] **Step 7: Запустить тесты**

Run: `uv run pytest backend/tests/test_dashboard.py -v && uv run ruff format backend && uv run ruff check backend`
Expected: 4 PASS, ruff без замечаний (format переносит длинные строки тестовых помощников).

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas.py backend/app/services/dashboard.py backend/app/api/dashboard.py backend/app/main.py backend/tests/test_dashboard.py
git commit -m "T-66: сводка координатора «что сегодня» (GET /dashboard/today)"
```

---

### Task 4: Аналитика — воронка, спрос и предложение, активность

**Files:**
- Modify: `backend/app/schemas.py` (в конец)
- Modify: `backend/app/services/dashboard.py`
- Modify: `backend/app/api/dashboard.py`
- Test: `backend/tests/test_dashboard.py`

- [ ] **Step 1: Написать падающие тесты** — дописать в `backend/tests/test_dashboard.py`:

```python
def test_funnel(db):
    funnel = {row.step: row for row in dashboard.analytics(db, NOW).funnel}
    assert list(funnel) == ["applied", "interviewed", "trained", "approved", "participated", "active"]
    assert [funnel[s].count for s in funnel] == [7, 4, 4, 3, 2, 1]
    assert funnel["applied"].by_occupation["schoolkid"] == 1
    assert funnel["interviewed"].by_occupation["schoolkid"] == 0  # школьник отвалился до собеседования
    assert set(funnel["applied"].by_occupation) == {
        "student", "pensioner", "remote", "employed", "schoolkid", "other"
    }


def test_supply_and_demand(db):
    a = dashboard.analytics(db, NOW)
    by_time = {r.key: (r.demand, r.supply) for r in a.by_time}
    assert list(by_time) == ["weekday_morning", "weekday_day", "weekday_evening", "weekend"]
    # будни утро: 2 свободных места; свободны «Активная» и «Давно был» (не отметил время — свободен всегда)
    assert by_time["weekday_morning"] == (2, 2)
    assert by_time["weekday_evening"] == (2, 1)  # онлайн-занятие 10.11 в 18:00
    assert by_time["weekend"] == (0, 2)
    by_region = {r.key: (r.demand, r.supply) for r in a.by_region}
    assert by_region == {"moscow": (2, 3), "online": (2, 1)}  # регионы без спроса и людей не показываем


def test_activity(db):
    a = dashboard.analytics(db, NOW)
    assert len(a.weeks) == 12
    assert a.weeks[-1].week_start.isoformat() == "2026-10-19"  # понедельник текущей недели
    assert sum(w.hours for w in a.weeks) == 3  # занятие 100 дней назад — за окном
    assert [(t.volunteer.name, t.hours) for t in a.top] == [("Активная", 3)]
    assert [(d.volunteer.name, d.days) for d in a.dormant] == [("Ни разу", None), ("Давно был", 100)]


def test_analytics_api(client):
    r = client.get("/dashboard/analytics")
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["funnel"]) == 6 and len(body["by_time"]) == 4 and len(body["weeks"]) == 12
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `uv run pytest backend/tests/test_dashboard.py -v -k "funnel or supply or activity or analytics"`
Expected: FAIL — `AttributeError: module 'app.services.dashboard' has no attribute 'analytics'`.

- [ ] **Step 3: Схемы** — в конец `backend/app/schemas.py`:

```python
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
```

и в импорт в начале файла: `from datetime import date, datetime`.

- [ ] **Step 4: Сервис** — в `backend/app/services/dashboard.py`:

импорты заменить на

```python
from collections import Counter, defaultdict
from collections.abc import Callable
from datetime import date, datetime, time, timedelta, timezone
from typing import get_args

from sqlalchemy import func
from sqlmodel import Session, select

from app.models import Interview, Opportunity, Participation, QuizAttempt, Volunteer
from app.schemas import (
    Answers,
    Availability,
    Counters,
    DashboardAnalytics,
    DashboardToday,
    Dormant,
    FunnelRow,
    FunnelStep,
    Occupation,
    PendingResponse,
    Region,
    SupplyRow,
    TodayInterview,
    TopVolunteer,
    Understaffed,
    VolunteerRef,
    WaitingVolunteer,
    WeekRow,
)
from app.services.opportunities import time_slot
from app.services.volunteers import training_score
```

к константам добавить

```python
DORMANT_DAYS = 45  # «засыпает» — допущен, но не участвовал столько дней
DEMAND_DAYS = 30  # спрос — занятия на месяц вперёд
WEEKS = 12
TRAINED = ("trained", "approved", "active")
APPROVED = ("approved", "active")
```

и в конец файла:

```python
def analytics(session: Session, now: datetime) -> DashboardAnalytics:
    data = Data(session)
    return DashboardAnalytics(
        funnel=funnel(data, now),
        **supply_and_demand(data, now),
        **activity(data, now),
    )


def funnel(data: Data, now: datetime) -> list[FunnelRow]:
    """Шаги «дошёл хотя бы до». Собеседованным считаем и тех, кто уже дальше «новой анкеты»:
    до T-59 собеседования шли без системы."""
    attended_at: defaultdict[int, list[datetime]] = defaultdict(list)
    for p, o in data.attended():
        if o.starts_at <= now:
            attended_at[p.volunteer_id].append(o.starts_at)
    interviewed = {i.volunteer_id for i in data.interviews if i.status == "done"}
    active_since = now - timedelta(days=ACTIVE_DAYS)
    passed: dict[FunnelStep, Callable[[Volunteer], bool]] = {
        "applied": lambda v: True,
        "interviewed": lambda v: v.id in interviewed or v.status != "new",
        "trained": lambda v: v.status in TRAINED,
        "approved": lambda v: v.status in APPROVED,
        "participated": lambda v: bool(attended_at[v.id]),
        "active": lambda v: any(d >= active_since for d in attended_at[v.id]),
    }
    rows = []
    for step, check in passed.items():
        reached = [v for v in data.volunteers if check(v)]
        by_occupation = {o: 0 for o in get_args(Occupation)}
        by_occupation.update(Counter(v.answers.get("occupation", "other") for v in reached))
        rows.append(FunnelRow(step=step, count=len(reached), by_occupation=by_occupation))
    return rows


def supply_and_demand(data: Data, now: datetime) -> dict[str, list[SupplyRow]]:
    """Спрос — свободные места в ближайших занятиях, предложение — допущенные, кому подходит.
    Время — как в «подходит вам»: не отметил, когда свободен, — значит свободен всегда."""
    horizon = now + timedelta(days=DEMAND_DAYS)
    free = {
        o.id: max(0, o.slots - data.taken(o.id))
        for o in data.opportunities.values()
        if now <= o.starts_at <= horizon
    }
    upcoming = [data.opportunities[i] for i in free]
    approved = [Answers.model_validate(v.answers) for v in data.volunteers if v.status in APPROVED]

    by_time = [
        SupplyRow(
            key=slot,
            demand=sum(free[o.id] for o in upcoming if time_slot(o.starts_at) == slot),
            supply=sum(not a.availability or slot in a.availability for a in approved),
        )
        for slot in get_args(Availability)
    ]

    by_region = []
    for key in [*get_args(Region), "online"]:
        if key == "online":
            demand = sum(free[o.id] for o in upcoming if o.format == "online")
            supply = sum("online" in a.formats for a in approved)
        else:
            demand = sum(
                free[o.id] for o in upcoming if o.format == "offline" and o.region == key
            )
            supply = sum(a.region == key and "offline" in a.formats for a in approved)
        if demand or supply:
            by_region.append(SupplyRow(key=key, demand=demand, supply=supply))
    return {"by_time": by_time, "by_region": by_region}


def activity(data: Data, now: datetime) -> dict[str, list]:
    """Часы и участия по неделям, топ-5 и «засыпающие»."""
    this_monday = now.date() - timedelta(days=now.weekday())
    mondays = [this_monday - timedelta(weeks=n) for n in range(WEEKS - 1, -1, -1)]
    window_start = datetime.combine(mondays[0], time.min)

    hours: defaultdict[date, float] = defaultdict(float)
    counts: Counter[date] = Counter()
    per_volunteer: defaultdict[int, list[float]] = defaultdict(list)
    last: dict[int, datetime] = {}
    for p, o in data.attended():
        if o.starts_at > now:
            continue
        last[p.volunteer_id] = max(last.get(p.volunteer_id, o.starts_at), o.starts_at)
        if o.starts_at >= window_start:
            day = o.starts_at.date()
            monday = day - timedelta(days=day.weekday())
            hours[monday] += p.hours
            counts[monday] += 1
            per_volunteer[p.volunteer_id].append(p.hours)

    weeks = [WeekRow(week_start=m, hours=hours[m], participations=counts[m]) for m in mondays]
    top = sorted(
        (
            TopVolunteer(volunteer=data.ref[vid], hours=sum(h), participations=len(h))
            for vid, h in per_volunteer.items()
        ),
        key=lambda t: (-t.hours, t.volunteer.name),
    )[:5]

    dormant = []
    for v in data.volunteers:
        if v.status not in APPROVED:
            continue
        seen = last.get(v.id)
        if seen is None:
            dormant.append(Dormant(volunteer=data.ref[v.id], last_attended=None, days=None))
        elif (now - seen).days >= DORMANT_DAYS:
            days = (now.date() - seen.date()).days
            dormant.append(Dormant(volunteer=data.ref[v.id], last_attended=seen.date(), days=days))
    # дольше всех не были — выше; кто ни разу не участвовал — в самом верху
    dormant.sort(key=lambda d: (d.days is not None, -(d.days or 0)))
    return {"weeks": weeks, "top": top, "dormant": dormant}
```

- [ ] **Step 5: HTTP** — в `backend/app/api/dashboard.py` импорт схем заменить на
`from app.schemas import DashboardAnalytics, DashboardToday` и добавить в конец:

```python
@router.get("/analytics", response_model=DashboardAnalytics)
def analytics(session: Session = Depends(get_session)) -> DashboardAnalytics:
    """Воронка волонтёров, спрос и предложение по времени и регионам, активность за 12 недель."""
    return dashboard.analytics(session, dashboard.local_now())
```

- [ ] **Step 6: Запустить тесты и линтер**

Run: `uv run pytest backend/tests/test_dashboard.py -v && uv run ruff check backend && uv run ruff format --check backend`
Expected: 8 PASS, ruff без замечаний (если `format --check` ругается — `uv run ruff format backend` и повторить).

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas.py backend/app/services/dashboard.py backend/app/api/dashboard.py backend/tests/test_dashboard.py
git commit -m "T-66: аналитика координатора — воронка, спрос и предложение, активность (GET /dashboard/analytics)"
```

---

### Task 5: Контракт фронта — `api.ts` и `labels.ts`

**Files:**
- Modify: `miniapp/src/api.ts`
- Modify: `miniapp/src/labels.ts`

- [ ] **Step 1: Типы** — в `miniapp/src/api.ts` заменить блок `export type Interview = {...}` на:

```ts
export type Decision = "next" | "think" | "reject"; // дальше / подумать / не подходит
export type InterviewResultIn = {
  motivation: number; // 1–5
  readiness: number; // 1–5, готовность к работе с подопечными
  regularity: number; // 1–5, насколько надёжно будет приходить
  decision: Decision;
  roles: string[]; // коды ролей
  comment: string;
};
export type InterviewResult = InterviewResultIn & { created_at: string };
export type Interview = {
  id: number;
  volunteer_id: number;
  starts_at: string;
  status: InterviewStatus;
  token: string; // ссылка на звонок — /call/<token>
  notified: boolean; // ссылка ушла волонтёру в Telegram; false — координатор отправляет её сам
  created_at: string;
  result: InterviewResult | null; // итог после звонка — только для фонда, волонтёру не показываем
};
export type PlanQuestion = { question: string; why: string };
export type InterviewPlan = {
  volunteer_id: number;
  questions: PlanQuestion[];
  focus: string[]; // на что обратить внимание
  ai: boolean; // false — базовый план, LLM недоступен
  created_at: string;
};

// ===== Дашборды кабинета координатора (T-66) =====
export type VolunteerRef = { id: number; name: string };
export type TodayInterview = {
  interview_id: number;
  volunteer: VolunteerRef;
  starts_at: string;
  token: string;
  overdue: boolean; // время прошло, а итога нет
};
export type WaitingVolunteer = {
  volunteer: VolunteerRef;
  since: string;
  days: number;
  training_score: number | null;
};
export type PendingResponse = {
  participation_id: number;
  opportunity_id: number;
  opportunity_title: string;
  starts_at: string;
  volunteer: VolunteerRef;
};
export type Understaffed = {
  opportunity_id: number;
  title: string;
  starts_at: string;
  slots: number;
  taken: number;
  missing: number;
};
export type DashboardToday = {
  interviews: TodayInterview[];
  new_without_interview: WaitingVolunteer[];
  awaiting_approval: WaitingVolunteer[];
  pending_responses: PendingResponse[];
  understaffed: Understaffed[];
  counters: { volunteers: number; active: number; hours_total: number; hours_month: number };
};
export type FunnelStep = "applied" | "interviewed" | "trained" | "approved" | "participated" | "active";
export type FunnelRow = { step: FunnelStep; count: number; by_occupation: Record<Occupation, number> };
export type SupplyRow = { key: Availability | Region | "online"; demand: number; supply: number };
export type WeekRow = { week_start: string; hours: number; participations: number };
export type TopVolunteer = { volunteer: VolunteerRef; hours: number; participations: number };
export type Dormant = { volunteer: VolunteerRef; last_attended: string | null; days: number | null };
export type DashboardAnalytics = {
  funnel: FunnelRow[];
  by_time: SupplyRow[];
  by_region: SupplyRow[];
  weeks: WeekRow[];
  top: TopVolunteer[];
  dormant: Dormant[];
};
```

- [ ] **Step 2: PUT в `request()`** — сигнатуру заменить на

```ts
async function request<T>(method: "GET" | "PATCH" | "PUT", path: string, body?: unknown): Promise<T> {
```

- [ ] **Step 3: Методы** — в `volunteersApi` после `updateInterview` добавить:

```ts
  interviewPlan: (volunteerId: number, refresh = false) =>
    request<InterviewPlan>(
      "GET",
      `/volunteers/${volunteerId}/interview-plan` + (refresh ? "?refresh=true" : ""),
    ),
  saveInterviewResult: (interviewId: number, data: InterviewResultIn) =>
    request<Interview>("PUT", `/interviews/${interviewId}/result`, data),
  dashboardToday: () => request<DashboardToday>("GET", "/dashboard/today"),
  dashboardAnalytics: () => request<DashboardAnalytics>("GET", "/dashboard/analytics"),
```

- [ ] **Step 4: Подписи** — в `miniapp/src/labels.ts` добавить `Decision, FunnelStep` в импорт типов и в конец:

```ts
export const DECISION: Record<Decision, string> = {
  next: "Дальше",
  think: "Подумать",
  reject: "Не подходит",
};

/** Шаги воронки волонтёров на «Аналитике». */
export const FUNNEL_STEP: Record<FunnelStep, string> = {
  applied: "Анкета",
  interviewed: "Собеседование",
  trained: "Обучение пройдено",
  approved: "Допущен",
  participated: "Первое участие",
  active: "Активен (60 дней)",
};
```

- [ ] **Step 5: Проверка типов** — `mock.ts` пока не компилируется (нет новых методов), это нормально:

Run: `cd miniapp && npm run typecheck; cd ..`
Expected: ошибки только в `src/mock.ts` («Property 'interviewPlan' is missing…», «Property 'result' is missing…»). Их
закрывает Task 6 — коммитим вместе.

---

### Task 6: Моки

**Files:**
- Modify: `miniapp/src/mock.ts`

- [ ] **Step 1: Импорты** — в `import type {...} from "./api"` добавить
`DashboardAnalytics, DashboardToday, InterviewPlan, PlanQuestion`.

- [ ] **Step 2: Собеседования с итогами и датами от сегодня** — заменить `const interviews: Interview[] = [...]` на:

```ts
/** Местное время без часового пояса, как у бэкенда: сегодня + days, в hour:00. */
function dayAt(days: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00:00`;
}

// Видеособеседования. Сам звонок на моках не работает — ему нужен сигнальный сервер бэкенда.
const interviews: Interview[] = [
  { id: 1, volunteer_id: 1, starts_at: dayAt(0, 15), status: "scheduled", token: "demo-call-token",
    notified: true, created_at: dayAt(-1, 12), result: null },
  { id: 2, volunteer_id: 7, starts_at: dayAt(-1, 16), status: "scheduled", token: "demo-call-late",
    notified: false, created_at: dayAt(-3, 12), result: null },
  { id: 3, volunteer_id: 3, starts_at: dayAt(-20, 12), status: "done", token: "demo-call-done",
    notified: true, created_at: dayAt(-22, 12),
    result: { motivation: 5, readiness: 5, regularity: 4, decision: "next", roles: ["workshop_assistant"],
      comment: "Сама ведёт керамику, готова к постоянной группе.", created_at: dayAt(-20, 13) } },
];
```

и в `scheduleInterview` в создаваемый объект добавить `result: null`.

- [ ] **Step 3: План по правилам** — перед `export const mockApi` добавить:

```ts
// ===== План собеседования: те же правила, что фолбэк на бэкенде (services/interview_plan.py) =====

const BASE_PLAN: PlanQuestion[] = [
  { question: "Почему вы хотите помогать именно нашему фонду?", why: "Понять мотивацию" },
  { question: "Был ли у вас опыт общения с детьми или взрослыми с особенностями развития?",
    why: "Готовность к работе с подопечными" },
  { question: "Что вы сделаете, если на занятии станет тяжело или непонятно, как себя вести?",
    why: "Как человек справляется с трудными ситуациями" },
  { question: "Как часто у вас реально получится приходить?", why: "Сверить ожидания по регулярности" },
];

function interviewPlan(v: Volunteer): InterviewPlan {
  const questions = [...BASE_PLAN];
  const focus: string[] = [];
  if (v.answers.occupation === "schoolkid") {
    questions.push({ question: "Нужны ли вам часы или баллы для школы? Сколько занятий планируете?",
      why: "Школьники часто приходят ради баллов и пропадают" });
    focus.push("Школьник — проверить, готов ли прийти больше одного раза");
  }
  if (!v.answers.experience.trim()) {
    questions.push({ question: "Как вы представляете занятие с особыми ребятами?", why: "Опыта в анкете нет" });
    focus.push("Нет опыта — рассказать, как проходят занятия");
  }
  if (v.answers.occupation === "pensioner") {
    questions.push({ question: "Удобно ли вам добираться? Сколько времени комфортно провести на занятии?",
      why: "Силы и дорога — частые причины пропусков" });
  }
  return { volunteer_id: v.id, questions, focus, ai: true, created_at: new Date().toISOString() };
}
```

- [ ] **Step 4: Сводка из состояния моков** — там же:

```ts
// ===== Дашборды. «Сегодня» считаем из моков, аналитику — заготовкой (у моков слишком мало истории) =====

const DAY = 86_400_000;

function dashboardToday(): DashboardToday {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const ref = (id: number) => ({ id, name: findVolunteer(id)?.name ?? "" });
  const days = (iso: string) => Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY));
  const booked = new Set(interviews.filter((i) => i.status !== "canceled").map((i) => i.volunteer_id));
  const upcoming = opportunities
    .filter((o) => new Date(o.starts_at) >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return {
    interviews: interviews
      .filter((i) => i.status === "scheduled" && new Date(i.starts_at) <= endOfDay)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((i) => ({ interview_id: i.id, volunteer: ref(i.volunteer_id), starts_at: i.starts_at, token: i.token,
        overdue: new Date(i.starts_at) < now })),
    new_without_interview: volunteers
      .filter((v) => v.status === "new" && !booked.has(v.id))
      .map((v) => ({ volunteer: ref(v.id), since: v.created_at, days: days(v.created_at), training_score: null })),
    awaiting_approval: volunteers
      .filter((v) => v.status === "trained")
      .map((v) => ({ volunteer: ref(v.id), since: v.created_at, days: days(v.created_at),
        training_score: v.training_score })),
    pending_responses: upcoming.flatMap((o) =>
      participations
        .filter((p) => p.opportunity_id === o.id && p.status === "responded")
        .map((p) => ({ participation_id: p.id, opportunity_id: o.id, opportunity_title: o.title,
          starts_at: o.starts_at, volunteer: ref(p.volunteer_id) })),
    ),
    understaffed: upcoming
      .filter((o) => new Date(o.starts_at).getTime() <= now.getTime() + 7 * DAY)
      .map((o) => opportunityOut(o))
      .filter((o) => o.taken < o.slots)
      .map((o) => ({ opportunity_id: o.id, title: o.title, starts_at: o.starts_at, slots: o.slots, taken: o.taken,
        missing: o.slots - o.taken })),
    counters: {
      volunteers: volunteers.length,
      active: volunteers.filter((v) => v.status === "active").length,
      hours_total: volunteers.reduce((sum, v) => sum + v.hours, 0),
      hours_month: 14,
    },
  };
}

/** Аналитика-заготовка: отвал школьников, дефицит «будни утром», неровная активность. */
function dashboardAnalytics(): DashboardAnalytics {
  const occ = (student: number, pensioner: number, remote: number, employed: number, schoolkid: number, other = 0) =>
    ({ student, pensioner, remote, employed, schoolkid, other });
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const hours = [6, 9, 3, 12, 8, 0, 10, 15, 7, 11, 18, 9];
  return {
    funnel: [
      { step: "applied", count: 40, by_occupation: occ(15, 10, 8, 4, 3) },
      { step: "interviewed", count: 27, by_occupation: occ(10, 9, 6, 1, 1) },
      { step: "trained", count: 21, by_occupation: occ(7, 8, 5, 1, 0) },
      { step: "approved", count: 17, by_occupation: occ(5, 7, 4, 1, 0) },
      { step: "participated", count: 13, by_occupation: occ(3, 6, 3, 1, 0) },
      { step: "active", count: 9, by_occupation: occ(2, 5, 2, 0, 0) },
    ],
    by_time: [
      { key: "weekday_morning", demand: 9, supply: 4 },
      { key: "weekday_day", demand: 6, supply: 5 },
      { key: "weekday_evening", demand: 2, supply: 7 },
      { key: "weekend", demand: 7, supply: 11 },
    ],
    by_region: [
      { key: "moscow", demand: 14, supply: 12 },
      { key: "moscow_region", demand: 3, supply: 3 },
      { key: "yaroslavl", demand: 4, supply: 2 },
      { key: "north_ossetia", demand: 2, supply: 1 },
      { key: "online", demand: 3, supply: 6 },
    ],
    weeks: hours.map((h, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() - 7 * (hours.length - 1 - i));
      return { week_start: d.toISOString().slice(0, 10), hours: h, participations: Math.round(h / 3) };
    }),
    top: [3, 10, 9, 1, 2].map((id) => ({ volunteer: { id, name: findVolunteer(id)?.name ?? "" },
      hours: findVolunteer(id)?.hours ?? 0, participations: Math.round((findVolunteer(id)?.hours ?? 0) / 3) })),
    dormant: [
      { volunteer: { id: 8, name: findVolunteer(8)?.name ?? "" }, last_attended: null, days: null },
      { volunteer: { id: 9, name: findVolunteer(9)?.name ?? "" }, last_attended: dayAt(-63, 10).slice(0, 10), days: 63 },
    ],
  };
}
```

- [ ] **Step 5: Методы мока** — в `mockApi` после `updateInterview` добавить:

```ts
  interviewPlan: (volunteerId) => {
    const v = findVolunteer(volunteerId);
    return v ? wait(interviewPlan(v), 1200) : notFound("Волонтёр"); // задержка — как у LLM
  },
  saveInterviewResult: (id, data) => {
    refresh();
    const i = interviews.find((x) => x.id === id);
    if (!i) return notFound("Собеседование");
    if (i.status === "canceled") return Promise.reject(new Error("Собеседование отменено — итог не сохраняем"));
    i.result = { ...data, created_at: new Date().toISOString() };
    i.status = "done";
    saveOpportunities();
    return wait(i);
  },
  dashboardToday: () => {
    refresh();
    return wait(dashboardToday());
  },
  dashboardAnalytics: () => wait(dashboardAnalytics()),
```

- [ ] **Step 6: Типы и сборка**

Run: `cd miniapp && npm run typecheck && npm run build; cd ..`
Expected: без ошибок.

- [ ] **Step 7: Проверить моки руками** — в консоли браузера на `VITE_MOCK=1 make dev-miniapp` (http://localhost:5173/admin):

```js
const { backend } = await import("/src/backend.ts");
console.log(await backend.dashboardToday());
console.log(await backend.dashboardAnalytics());
console.log(await backend.interviewPlan(7));
console.log(await backend.saveInterviewResult(1, { motivation: 4, readiness: 4, regularity: 3, decision: "think", roles: [], comment: "" }));
```

Expected: в сводке 2 собеседования (просроченное у волонтёра 7 первым), «Ждут знакомства» — Дмитрий Волков (4),
«Ждут допуска» — Анна (1) и Софья (6); план для 7 содержит вопрос про баллы; итог ставит `status: "done"`.
Перед проверкой очистить старые моки: `localStorage.removeItem("mock_interviews")`.

- [ ] **Step 8: Commit**

```bash
git add miniapp/src/api.ts miniapp/src/labels.ts miniapp/src/mock.ts
git commit -m "T-66: контракт и моки — план и итог собеседования, сводка и аналитика"
```

---

### Task 7: Демо-история для дашбордов

**Files:**
- Create: `data/demo/history.json`
- Modify: `scripts/seed.py`
- Test: `backend/tests/test_demo_data.py`

Волонтёры в `history.json` указаны номерами анкет из `volunteers.json` (1–40), seed переводит номер в id по имени.

- [ ] **Step 1: Написать падающий тест** — в `backend/tests/test_demo_data.py` импорты заменить на

```python
import json
import re
from collections import Counter
from pathlib import Path
from typing import get_args

from app.schemas import InterviewResultIn, OpportunityIn, VolunteerIn, VolunteerStatus
```

и дописать в конец:

```python
def test_history_is_consistent():
    """history.json: статусы, прошлые занятия, отклики и собеседования для дашбордов (T-66)."""
    history = load("history.json")
    forms = volunteers()
    roles_file = DEMO_DIR.parent / "roles.json"
    roles = {r["code"] for r in json.loads(roles_file.read_text(encoding="utf-8"))}

    def in_range(number: int) -> bool:
        return 1 <= number <= len(forms)

    for number, status in history["statuses"].items():
        assert in_range(int(number)) and status in get_args(VolunteerStatus)

    for past in history["past_opportunities"]:
        assert past["days_ago"] > 0
        OpportunityIn.model_validate({**past["opportunity"], "starts_at": f"2026-01-01T{past['time']}:00"})
        assert past["opportunity"]["role_code"] in roles
        assert len(past["attended"]) <= past["opportunity"]["slots"]
        assert all(in_range(n) for n in past["attended"])

    titles = {o["title"] for o in load("opportunities.json")}
    for response in history["responses"]:
        assert response["opportunity"] in titles and in_range(response["volunteer"])

    for interview in history["interviews"]:
        assert in_range(interview["volunteer"])
        if interview.get("result"):
            result = InterviewResultIn.model_validate(interview["result"])
            assert set(result.roles) <= roles
            assert interview["days"] < 0  # итог бывает только у прошедших

    # школьники отваливаются: никто из них не дошёл до допуска — это видно на воронке
    schoolkids = {str(i) for i, f in enumerate(forms, 1) if f.answers.occupation == "schoolkid"}
    assert not {n for n, s in history["statuses"].items() if s in ("approved", "active")} & schoolkids
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `uv run pytest backend/tests/test_demo_data.py -v -k history`
Expected: FAIL — `FileNotFoundError: ... history.json`.

- [ ] **Step 3: Данные** — `data/demo/history.json` (всё вымышленное; даты — от дня запуска seed):

```json
{
  "statuses": {
    "16": "active", "21": "active", "22": "active", "26": "active", "29": "active",
    "7": "approved", "11": "approved", "18": "approved", "19": "approved", "24": "approved",
    "28": "approved", "32": "approved", "33": "approved",
    "4": "trained", "5": "trained", "23": "trained", "34": "trained",
    "2": "training", "13": "training", "39": "training"
  },
  "past_opportunities": [
    {"days_ago": 3, "time": "10:00", "attended": [16, 21, 26],
     "opportunity": {"title": "Керамика с группой из интерната", "description": "Помочь педагогу на занятии по керамике.", "role_code": "ceramics_assistant", "region": "moscow", "format": "offline", "place": "Керамическая мастерская фонда, Москва", "slots": 3, "hours": 3}},
    {"days_ago": 9, "time": "11:00", "attended": [22, 29, 16],
     "opportunity": {"title": "Инклюзивная мастерская живописи", "description": "Помочь участникам с красками и кистями.", "role_code": "workshop_assistant", "region": "moscow", "format": "offline", "place": "Мастерские фонда, Москва", "slots": 4, "hours": 3}},
    {"days_ago": 16, "time": "10:00", "attended": [21, 26],
     "opportunity": {"title": "Сопровождение группы на арт-терапию", "description": "Встретить группу у интерната и проводить до мастерской.", "role_code": "group_companion", "region": "moscow", "format": "offline", "place": "Москва", "slots": 2, "hours": 4}},
    {"days_ago": 24, "time": "12:00", "attended": [19, 32],
     "opportunity": {"title": "Ярмарка изделий в Ярославле", "description": "Помочь на стенде мастерских.", "role_code": "fair_helper", "region": "yaroslavl", "format": "offline", "place": "Ярославль", "slots": 3, "hours": 5}},
    {"days_ago": 30, "time": "10:00", "attended": [16, 22],
     "opportunity": {"title": "Кулинарный мастер-класс с группой", "description": "Помочь повару-педагогу.", "role_code": "cooking_assistant", "region": "moscow", "format": "offline", "place": "Кухня-студия фонда, Москва", "slots": 3, "hours": 3}},
    {"days_ago": 38, "time": "19:00", "attended": [26],
     "opportunity": {"title": "Монтаж ролика о мастерской", "description": "Смонтировать короткий ролик для соцсетей.", "role_code": "video_smm", "region": "other", "format": "online", "place": "Онлайн", "slots": 1, "hours": 4}},
    {"days_ago": 50, "time": "11:00", "attended": [28],
     "opportunity": {"title": "Фотосъёмка осенней ярмарки", "description": "Снять стенд и изделия.", "role_code": "photographer", "region": "moscow", "format": "offline", "place": "Москва", "slots": 1, "hours": 4}},
    {"days_ago": 58, "time": "10:00", "attended": [21, 29],
     "opportunity": {"title": "Керамика с группой из интерната", "description": "Помочь педагогу на занятии по керамике.", "role_code": "ceramics_assistant", "region": "moscow", "format": "offline", "place": "Керамическая мастерская фонда, Москва", "slots": 3, "hours": 3}},
    {"days_ago": 70, "time": "11:00", "attended": [18, 16],
     "opportunity": {"title": "Летняя ярмарка в Подмосковье", "description": "Помочь на стенде мастерских.", "role_code": "fair_helper", "region": "moscow_region", "format": "offline", "place": "Подмосковье", "slots": 3, "hours": 5}},
    {"days_ago": 79, "time": "10:00", "attended": [22],
     "opportunity": {"title": "Валяние с группой", "description": "Помочь участникам с шерстью и иглами.", "role_code": "workshop_assistant", "region": "moscow", "format": "offline", "place": "Мастерские фонда, Москва", "slots": 2, "hours": 3}}
  ],
  "responses": [
    {"opportunity": "Фотосъёмка изделий для каталога", "volunteer": 8},
    {"opportunity": "Субботняя мастерская по керамике", "volunteer": 11}
  ],
  "interviews": [
    {"volunteer": 1, "days": 0, "time": "15:00"},
    {"volunteer": 3, "days": 0, "time": "17:00"},
    {"volunteer": 38, "days": -1, "time": "16:00"},
    {"volunteer": 16, "days": -40, "time": "12:00",
     "result": {"motivation": 5, "readiness": 5, "regularity": 5, "decision": "next", "roles": ["workshop_assistant"], "comment": "Много лет шила, хочет постоянную группу."}},
    {"volunteer": 21, "days": -35, "time": "12:00",
     "result": {"motivation": 5, "readiness": 4, "regularity": 5, "decision": "next", "roles": ["group_companion"], "comment": "Спокойный, по будням свободен с утра."}},
    {"volunteer": 26, "days": -45, "time": "18:00",
     "result": {"motivation": 4, "readiness": 4, "regularity": 4, "decision": "next", "roles": ["video_smm"], "comment": "Монтирует видео, может и очно по утрам."}},
    {"volunteer": 39, "days": -6, "time": "17:00",
     "result": {"motivation": 2, "readiness": 3, "regularity": 2, "decision": "think", "roles": [], "comment": "Нужны часы для школы. Предложить одну ярмарку и посмотреть."}},
    {"volunteer": 12, "days": -9, "time": "19:00",
     "result": {"motivation": 3, "readiness": 3, "regularity": 2, "decision": "reject", "roles": [], "comment": "Свободен только по вечерам, групп в это время нет."}}
  ]
}
```

- [ ] **Step 4: Запустить тест**

Run: `uv run pytest backend/tests/test_demo_data.py -v`
Expected: все PASS.

- [ ] **Step 5: seed** — в `scripts/seed.py`:

после `OPPORTUNITIES = ...` добавить `HISTORY = DEMO / "history.json"`, в импорты — `from datetime import date, timedelta`,
в конце `main()` заменить

```python
    print(f"✅ Загружено возможностей: {len(items)}")
    return 0
```

на

```python
    print(f"✅ Загружено возможностей: {len(items)}")
    return seed_history(forms)
```

и перед `if __name__ == "__main__":` добавить:

```python
def seed_history(forms: list[dict]) -> int:
    """Прошлое для дашбордов (T-66): статусы, прошедшие занятия с участием, отклики, собеседования.
    Даты считаем от сегодняшнего дня — сводка «что сегодня» живая в любой день демо."""
    history = json.loads(HISTORY.read_text(encoding="utf-8"))
    ids = {v["name"]: v["id"] for v in call("GET", "/volunteers")}

    def vid(number: int) -> int:
        return ids[forms[number - 1]["name"]]

    def when(days: int, hhmm: str) -> str:
        return f"{date.today() + timedelta(days=days)}T{hhmm}:00"

    try:
        for number, status in history["statuses"].items():
            call("PATCH", f"/volunteers/{vid(int(number))}", {"status": status})
        for past in history["past_opportunities"]:
            item = {**past["opportunity"], "starts_at": when(-past["days_ago"], past["time"])}
            opportunity = call("POST", "/opportunities", item)
            invited = call(
                "POST",
                f"/opportunities/{opportunity['id']}/invite",
                {"volunteer_ids": [vid(n) for n in past["attended"]]},
            )
            for participation in invited:
                call("PATCH", f"/participations/{participation['id']}", {"status": "attended"})
        catalog = {o["title"]: o["id"] for o in call("GET", "/opportunities")}
        for response in history["responses"]:
            call(
                "POST",
                f"/opportunities/{catalog[response['opportunity']]}/respond",
                {"volunteer_id": vid(response["volunteer"])},
            )
        for item in history["interviews"]:
            starts_at = when(item["days"], item["time"])
            interview = call(
                "POST", f"/volunteers/{vid(item['volunteer'])}/interviews", {"starts_at": starts_at}
            )
            if item.get("result"):
                call("PUT", f"/interviews/{interview['id']}/result", item["result"])
    except urllib.error.HTTPError as e:
        print(f"❌ История для дашбордов: {e.code} {e.read().decode()}")
        return 1
    print(
        f"✅ История: {len(history['past_opportunities'])} прошедших занятий, "
        f"{len(history['interviews'])} собеседований"
    )
    return 0
```

и обновить docstring в начале файла: после строки «Возможности грузим, если каталог пуст, — независимо от анкет.»
добавить строку «Вместе с ними — история для дашбордов из history.json: статусы, прошедшие занятия, собеседования.»

- [ ] **Step 6: Прогнать seed на чистой локальной базе**

```bash
mv data/app.db data/app.db.bak 2>/dev/null; make dev   # в отдельном терминале, LLM_PROVIDER=fake достаточно
make seed
curl -s localhost:8000/dashboard/today | python -m json.tool | head -40
curl -s localhost:8000/dashboard/analytics | python -m json.tool | head -60
```

Expected: seed заканчивается строкой «✅ История: 10 прошедших занятий, 8 собеседований»; в `today` — 3 собеседования
(просроченное первым), непустые «Ждут знакомства», «Ждут допуска», 2 отклика; в `analytics` — `funnel` 40 → … с нулём
школьников на `approved`, недели с часами, «засыпающие» (24, 33, 7, 11 — ни разу; 18 и 28 — давно).
Вернуть свою базу: остановить бэкенд, `mv data/app.db.bak data/app.db`.

- [ ] **Step 7: Commit**

```bash
git add data/demo/history.json scripts/seed.py backend/tests/test_demo_data.py
git commit -m "T-66: демо-история для дашбордов — прошедшие занятия, отклики, собеседования с итогами"
```

---

### Task 8: Проверка целиком и сдача

**Files:**
- Modify: `docs/CASE.md` (строка «Рабочее пространство команды» в таблице блоков)

- [ ] **Step 1: CASE.md** — в таблице «8 блоков» строку «Рабочее пространство команды» заменить на:

```markdown
| Рабочее пространство команды — база, история, статусы, задачи, фильтры | `/admin`: сводка «что сегодня», аналитика (воронка, спрос и предложение по времени и регионам, активность), поиск, база с фильтрами, карточка с заметками, собеседование с AI-планом и итогом, возможности и участники | T-08, T-09, T-23, T-66, T-69 | MVP |
```

- [ ] **Step 2: Полная проверка**

Run: `make lint && make test`
Expected: ruff и tsc без ошибок, все тесты PASS.

- [ ] **Step 3: Живой бэкенд** — `make dev` и `make smoke`; открыть http://localhost:8000/docs — в Swagger есть
`/dashboard/today`, `/dashboard/analytics`, `/volunteers/{id}/interview-plan`, `PUT /interviews/{id}/result`.
На реальном LLM (если в `.env` настроен) — `GET /volunteers/1/interview-plan` отдаёт 5–7 осмысленных вопросов, `ai: true`.

- [ ] **Step 4: Commit**

```bash
git add docs/CASE.md
git commit -m "T-66: CASE.md — сводка и аналитика в рабочем пространстве фонда"
```

- [ ] **Step 5: Сдать через `/finish-task`** — заметка `docs/changes/2026-10-21-fry-alt-T-66-cabinet.md` по шаблону
(что изменилось, эндпоинты и таблицы, «на что обратить внимание»: `@gordeymos` — экраны в #69, контракт готов;
`make seed` теперь грузит историю; новые таблицы создаются сами), PR `Closes #66`, в описании PR —
**@gordeymos: меняется контракт `api.ts` / `mock.ts` / `labels.ts`** — дождаться его отметки до мержа.
Пушить ветку явно: `git push -u origin a/T-66-cabinet` (сейчас ветка смотрит на `origin/main`).
