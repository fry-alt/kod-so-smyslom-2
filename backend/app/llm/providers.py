"""Провайдеры LLM и эмбеддингов.

Все «настоящие» провайдеры, кроме Anthropic, ходят через OpenAI SDK — меняется только base_url,
ключ и имя модели. Провайдер выбирается переменной LLM_PROVIDER (см. build_chat_provider).

Таймауты и ретраи делает сам SDK (timeout, max_retries). Если основная модель так и не ответила,
пробуем fallback-модель (LLM_FALLBACK_MODEL / YANDEX_FALLBACK_MODEL / ...).
"""

import hashlib
import json
import logging
import math
import re
from collections.abc import Iterator
from typing import Any, Protocol

from openai import OpenAI, OpenAIError

from app.config import Settings

log = logging.getLogger(__name__)

Message = dict[str, str]  # {"role": "system" | "user" | "assistant", "content": "..."}


class LLMError(RuntimeError):
    """Понятная ошибка вызова LLM. API превращает её в ответ 502 с этим текстом."""


class ChatProvider(Protocol):
    name: str
    model: str

    def complete(self, messages: list[Message]) -> str: ...

    def stream(self, messages: list[Message]) -> Iterator[str]: ...


class Embedder(Protocol):
    name: str

    def embed(self, texts: list[str], kind: str = "doc") -> list[list[float]]: ...


# ---------------------------------------------------------------------------
# OpenAI-совместимые провайдеры: openai_compatible, yandex, gigachat (через gpt2giga)
# ---------------------------------------------------------------------------


class OpenAICompatibleProvider:
    def __init__(
        self,
        *,
        name: str,
        client: OpenAI,
        model: str,
        fallback_model: str = "",
        temperature: float = 0.3,
        max_tokens: int = 2000,
    ):
        self.name = name
        self.client = client
        self.model = model
        self.fallback_model = fallback_model
        self.temperature = temperature
        self.max_tokens = max_tokens

    def complete(self, messages: list[Message]) -> str:
        models = [m for m in (self.model, self.fallback_model) if m]
        last_error: Exception | None = None
        for model in models:
            try:
                resp = self.client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=self.temperature,
                    max_tokens=self.max_tokens,
                )
                return resp.choices[0].message.content or ""
            except OpenAIError as e:
                last_error = e
                log.warning("%s: модель %s не ответила: %s", self.name, model, e)
        raise LLMError(f"LLM-провайдер {self.name} не ответил: {last_error}") from last_error

    def stream(self, messages: list[Message]) -> Iterator[str]:
        try:
            chunks = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                stream=True,
            )
            for chunk in chunks:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except OpenAIError as e:
            raise LLMError(f"LLM-провайдер {self.name} не ответил: {e}") from e


class OpenAIEmbedder:
    """Эмбеддинги через /v1/embeddings. У Yandex разные модели для документов и запросов."""

    def __init__(
        self, *, name: str, client: OpenAI, doc_model: str, query_model: str, batch_size: int = 64
    ):
        self.name = name
        self.client = client
        self.doc_model = doc_model
        self.query_model = query_model
        self.batch_size = batch_size

    def embed(self, texts: list[str], kind: str = "doc") -> list[list[float]]:
        model = self.query_model if kind == "query" else self.doc_model
        vectors: list[list[float]] = []
        try:
            for i in range(0, len(texts), self.batch_size):
                # SDK openai по умолчанию просит base64 — Yandex его не принимает (ошибка 400)
                resp = self.client.embeddings.create(
                    model=model, input=texts[i : i + self.batch_size], encoding_format="float"
                )
                vectors.extend(item.embedding for item in resp.data)
        except OpenAIError as e:
            raise LLMError(f"Эмбеддинги {self.name} недоступны: {e}") from e
        return vectors


# ---------------------------------------------------------------------------
# Anthropic (опционально): uv sync --group anthropic
# ---------------------------------------------------------------------------


class AnthropicProvider:
    def __init__(self, *, api_key: str, model: str, timeout: float, max_retries: int):
        try:
            import anthropic
        except ImportError as e:
            raise LLMError("Для LLM_PROVIDER=anthropic выполните: uv sync --group anthropic") from e
        self._anthropic = anthropic
        self.name = "anthropic"
        self.model = model
        self.client = anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=max_retries)

    def _request(self, messages: list[Message]) -> dict[str, Any]:
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        params: dict[str, Any] = {
            "model": self.model,
            "max_tokens": 16000,
            "messages": [m for m in messages if m["role"] != "system"],
        }
        if system:
            params["system"] = system
        return params

    def complete(self, messages: list[Message]) -> str:
        try:
            resp = self.client.messages.create(**self._request(messages))
        except self._anthropic.APIError as e:
            raise LLMError(f"LLM-провайдер anthropic не ответил: {e}") from e
        if resp.stop_reason == "refusal":
            raise LLMError("Модель отказалась отвечать на этот запрос")
        return "".join(block.text for block in resp.content if block.type == "text")

    def stream(self, messages: list[Message]) -> Iterator[str]:
        try:
            with self.client.messages.stream(**self._request(messages)) as stream:
                yield from stream.text_stream
        except self._anthropic.APIError as e:
            raise LLMError(f"LLM-провайдер anthropic не ответил: {e}") from e


# ---------------------------------------------------------------------------
# fake: детерминированный мок без сети — для тестов и разработки без ключей
# ---------------------------------------------------------------------------

JSON_SCHEMA_RE = re.compile(r"<json_schema>\s*(.*?)\s*</json_schema>", re.S)
FIRST_SOURCE_RE = re.compile(r"^\[1\][^\n]*\n(?:#[^\n]*\n|\s*\n)*([^\n]+)", re.M)


class FakeProvider:
    """Отвечает без сети. Если в промпте есть JSON-схема — возвращает валидный JSON по ней."""

    name = "fake"
    model = "fake"

    def complete(self, messages: list[Message]) -> str:
        text = "\n".join(m["content"] for m in messages)
        last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        schema_match = JSON_SCHEMA_RE.search(text)
        if schema_match:
            # для RAG берём первую строку фрагмента [1] (последнего — первый бывает в few-shot),
            # чтобы ответ был «по данным»
            sources = FIRST_SOURCE_RE.findall(last_user)
            hint = "[fake] " + _short(sources[-1] if sources else last_user)
            schema = json.loads(schema_match.group(1))
            return json.dumps(_sample_from_schema(schema, schema, hint), ensure_ascii=False)
        return (
            f"[fake] Вы написали: «{_short(last_user)}». Это ответ-заглушка: "
            "укажите LLM_PROVIDER в .env, чтобы подключить настоящую модель."
        )

    def stream(self, messages: list[Message]) -> Iterator[str]:
        yield from re.findall(r"\S+\s*", self.complete(messages))


def _short(text: str, limit: int = 200) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[:limit] + "…"


def _sample_from_schema(node: dict, root: dict, hint: str) -> Any:
    if "$ref" in node:
        return _sample_from_schema(root["$defs"][node["$ref"].split("/")[-1]], root, hint)
    for key in ("anyOf", "oneOf", "allOf"):
        if key in node:
            options = [o for o in node[key] if o.get("type") != "null"] or node[key]
            return _sample_from_schema(options[0], root, hint)
    if "enum" in node:
        return node["enum"][0]
    match node.get("type"):
        case "object":
            props = node.get("properties", {})
            return {k: _sample_from_schema(v, root, hint) for k, v in props.items()}
        case "array":
            return [_sample_from_schema(node.get("items", {}), root, hint)]
        case "integer":
            return 1
        case "number":
            return 1.0
        case "boolean":
            return True
        case "null":
            return None
        case _:
            return hint


STOP_WORDS = {"как", "что", "для", "это", "или", "при", "где", "когда", "если", "кто", "the"}


class FakeEmbedder:
    """«Мешок слов» через хеширование: без сети, но поиск по документам реально работает."""

    name = "fake"
    dim = 512

    def embed(self, texts: list[str], kind: str = "doc") -> list[list[float]]:
        return [self._vector(t) for t in texts]

    def _vector(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        for token in re.findall(r"\w+", text.lower().replace("ё", "е")):
            if len(token) < 3 or token in STOP_WORDS:
                continue
            stem = token[:6]  # грубый «стемминг» для русской морфологии
            vec[int(hashlib.md5(stem.encode()).hexdigest(), 16) % self.dim] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


class LocalEmbedder:
    """sentence-transformers на CPU. Нужна группа: uv sync --group local-embeddings"""

    def __init__(self, model_name: str):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as e:
            raise LLMError(
                "Локальные эмбеддинги не установлены: uv sync --group local-embeddings"
            ) from e
        self.name = "local"
        self.model = SentenceTransformer(model_name)

    def embed(self, texts: list[str], kind: str = "doc") -> list[list[float]]:
        return self.model.encode(texts, normalize_embeddings=True).tolist()


# ---------------------------------------------------------------------------
# Фабрики
# ---------------------------------------------------------------------------


def _require(value: str, message: str) -> str:
    if not value:
        raise LLMError(message)
    return value


def _openai_client(s: Settings, base_url: str, api_key: str, project: str | None = None) -> OpenAI:
    return OpenAI(
        base_url=base_url,
        api_key=api_key,
        project=project,
        timeout=s.llm_timeout,
        max_retries=s.llm_max_retries,
    )


def build_chat_provider(s: Settings) -> ChatProvider:
    common = {"temperature": s.llm_temperature, "max_tokens": s.llm_max_tokens}
    match s.llm_provider:
        case "fake":
            return FakeProvider()
        case "openai_compatible":
            key = _require(s.llm_api_key, "Задайте LLM_API_KEY в .env")
            return OpenAICompatibleProvider(
                name="openai_compatible",
                client=_openai_client(s, s.llm_base_url, key),
                model=s.llm_model,
                fallback_model=s.llm_fallback_model,
                **common,
            )
        case "yandex":
            key = _require(s.yandex_api_key, "Задайте YANDEX_API_KEY в .env")
            folder = _require(s.yandex_folder_id, "Задайте YANDEX_FOLDER_ID в .env")
            fallback = (
                f"gpt://{folder}/{s.yandex_fallback_model}" if s.yandex_fallback_model else ""
            )
            return OpenAICompatibleProvider(
                name="yandex",
                client=_openai_client(s, s.yandex_base_url, key, project=folder),
                model=f"gpt://{folder}/{s.yandex_model}",
                fallback_model=fallback,
                **common,
            )
        case "gigachat":
            key = _require(s.gpt2giga_api_key, "Задайте GPT2GIGA_API_KEY в .env")
            return OpenAICompatibleProvider(
                name="gigachat",
                client=_openai_client(s, s.gigachat_base_url, key),
                model=s.gigachat_model,
                fallback_model=s.gigachat_fallback_model,
                **common,
            )
        case "anthropic":
            key = _require(s.anthropic_api_key, "Задайте ANTHROPIC_API_KEY в .env")
            return AnthropicProvider(
                api_key=key,
                model=s.anthropic_model,
                timeout=s.llm_timeout,
                max_retries=s.llm_max_retries,
            )
    raise LLMError(f"Неизвестный LLM_PROVIDER: {s.llm_provider}")


def resolve_embeddings_provider(s: Settings) -> str:
    """Какой бэкенд эмбеддингов реально используется (от него зависит имя коллекции Chroma)."""
    if s.embeddings_provider != "auto":
        return s.embeddings_provider
    if s.llm_provider == "fake":
        return "fake"
    if s.llm_provider == "anthropic":  # у Anthropic нет эмбеддингов → локальная модель
        return "local"
    return "provider"


def build_embedder(s: Settings) -> Embedder:
    match resolve_embeddings_provider(s):
        case "fake":
            return FakeEmbedder()
        case "local":
            return LocalEmbedder(s.local_embed_model)
    match s.llm_provider:
        case "openai_compatible":
            key = _require(s.llm_api_key, "Задайте LLM_API_KEY в .env")
            client = _openai_client(s, s.llm_base_url, key)
            return OpenAIEmbedder(
                name="openai_compatible",
                client=client,
                doc_model=s.llm_embed_model,
                query_model=s.llm_embed_model,
            )
        case "yandex":
            key = _require(s.yandex_api_key, "Задайте YANDEX_API_KEY в .env")
            folder = _require(s.yandex_folder_id, "Задайте YANDEX_FOLDER_ID в .env")
            return OpenAIEmbedder(
                name="yandex",
                client=_openai_client(s, s.yandex_base_url, key, project=folder),
                doc_model=f"emb://{folder}/{s.yandex_embed_doc_model}",
                query_model=f"emb://{folder}/{s.yandex_embed_query_model}",
                batch_size=1,  # нативный API Yandex векторизует по одному тексту — не рискуем
            )
        case "gigachat":
            key = _require(s.gpt2giga_api_key, "Задайте GPT2GIGA_API_KEY в .env")
            return OpenAIEmbedder(
                name="gigachat",
                client=_openai_client(s, s.gigachat_base_url, key),
                doc_model=s.gigachat_embed_model,
                query_model=s.gigachat_embed_model,
            )
    raise LLMError(
        f"У провайдера {s.llm_provider} нет эмбеддингов — укажите EMBEDDINGS_PROVIDER=local или fake"
    )
