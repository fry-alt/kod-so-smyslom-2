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
