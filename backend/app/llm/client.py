"""Единая точка входа к LLM: chat(), chat_json(schema), stream(), embed().

Пример:
    from app.llm.client import get_llm
    llm = get_llm()
    text = llm.chat("Привет!", system="Ты помощник фонда")
    result = llm.chat_json("Классифицируй обращение: ...", schema=MySchema)
"""

import json
import logging
import re
import time
from collections.abc import Iterator
from functools import lru_cache

from pydantic import BaseModel, ValidationError

from app.config import get_settings
from app.llm.providers import (
    ChatProvider,
    Embedder,
    LLMError,
    Message,
    build_chat_provider,
    build_embedder,
)

log = logging.getLogger(__name__)

JSON_INSTRUCTION = (
    "Ответь ТОЛЬКО одним JSON-объектом, без пояснений и без markdown. "
    "Объект должен соответствовать JSON-схеме:\n<json_schema>\n{schema}\n</json_schema>"
)


class LLMClient:
    def __init__(self, provider: ChatProvider, embedder: Embedder | None = None):
        self.provider = provider
        self._embedder = embedder

    def chat(self, prompt: str | list[Message], *, system: str | None = None) -> str:
        messages = to_messages(prompt, system)
        started = time.perf_counter()
        answer = self.provider.complete(messages)
        log.info(
            "chat %s/%s: %d сообщ. → %d симв. за %.0f мс",
            self.provider.name,
            self.provider.model,
            len(messages),
            len(answer),
            (time.perf_counter() - started) * 1000,
        )
        return answer

    def chat_json[T: BaseModel](
        self, prompt: str | list[Message], schema: type[T], *, system: str | None = None
    ) -> T:
        """Просит модель вернуть JSON по схеме и валидирует его. При ошибке — один повтор."""
        instruction = JSON_INSTRUCTION.format(
            schema=json.dumps(schema.model_json_schema(), ensure_ascii=False)
        )
        full_system = f"{system}\n\n{instruction}" if system else instruction
        messages = to_messages(prompt, full_system)

        raw = self.chat(messages)
        try:
            return schema.model_validate(parse_json(raw))
        except (ValueError, ValidationError) as first_error:
            log.warning("chat_json: невалидный ответ, повторяем. Ошибка: %s", first_error)
            messages += [
                {"role": "assistant", "content": raw},
                {
                    "role": "user",
                    "content": f"Ответ не прошёл проверку: {first_error}\n"
                    "Верни только исправленный JSON по схеме.",
                },
            ]
            raw = self.chat(messages)
            try:
                return schema.model_validate(parse_json(raw))
            except (ValueError, ValidationError) as e:
                raise LLMError(f"Модель дважды вернула невалидный JSON: {e}") from e

    def stream(self, prompt: str | list[Message], *, system: str | None = None) -> Iterator[str]:
        yield from self.provider.stream(to_messages(prompt, system))

    def embed(self, texts: list[str], kind: str = "doc") -> list[list[float]]:
        """kind="doc" для индексации документов, kind="query" для поискового запроса."""
        return self.embedder.embed(texts, kind=kind)

    @property
    def embedder(self) -> Embedder:
        if self._embedder is None:
            self._embedder = build_embedder(get_settings())
        return self._embedder


def to_messages(prompt: str | list[Message], system: str | None = None) -> list[Message]:
    messages = [{"role": "user", "content": prompt}] if isinstance(prompt, str) else list(prompt)
    if system:
        messages = [{"role": "system", "content": system}, *messages]
    return messages


def parse_json(text: str) -> dict:
    """Достаёт JSON-объект из ответа модели: убирает ```json ... ``` и текст вокруг."""
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("в ответе нет JSON-объекта")
    return json.loads(text[start : end + 1])


@lru_cache
def get_llm() -> LLMClient:
    s = get_settings()
    return LLMClient(build_chat_provider(s))
