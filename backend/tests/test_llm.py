import pytest
from pydantic import BaseModel

from app.llm.client import LLMClient, parse_json
from app.llm.prompts import load_prompt
from app.llm.providers import FakeEmbedder, FakeProvider, LLMError


class Verdict(BaseModel):
    category: str
    score: int


class ScriptedProvider:
    """Отдаёт заранее заданные ответы по очереди — чтобы проверить повтор в chat_json."""

    name = "scripted"
    model = "scripted"

    def __init__(self, answers: list[str]):
        self.answers = answers
        self.calls = 0

    def complete(self, messages):
        self.calls += 1
        return self.answers.pop(0)

    def stream(self, messages):
        yield self.complete(messages)


def test_chat_json_with_fake_provider():
    result = LLMClient(FakeProvider()).chat_json("Оцени обращение", Verdict)
    assert isinstance(result, Verdict)


def test_chat_json_retries_once_on_invalid_json():
    provider = ScriptedProvider(["это не JSON", '```json\n{"category": "help", "score": 5}\n```'])
    result = LLMClient(provider).chat_json("...", Verdict)
    assert result == Verdict(category="help", score=5)
    assert provider.calls == 2


def test_chat_json_fails_after_second_invalid_answer():
    provider = ScriptedProvider(['{"category": "help"}', "опять не JSON"])
    with pytest.raises(LLMError):
        LLMClient(provider).chat_json("...", Verdict)
    assert provider.calls == 2


def test_parse_json_strips_text_around():
    assert parse_json('Вот ответ: {"a": 1} — готово') == {"a": 1}
    with pytest.raises(ValueError):
        parse_json("нет json")


def test_fake_embeddings_are_deterministic_and_normalized():
    a, b = FakeEmbedder().embed(["волонтёр фонда", "волонтёр фонда"])
    assert a == b
    assert abs(sum(x * x for x in a) - 1) < 1e-6


def test_load_prompt_substitutes_variables():
    text = load_prompt("rag_answer", context="[1] источник: x\nтекст", question="Вопрос?")
    assert "Вопрос: Вопрос?" in text
    with pytest.raises(KeyError):
        load_prompt("rag_answer", context="...")
    with pytest.raises(FileNotFoundError):
        load_prompt("no_such_prompt")
