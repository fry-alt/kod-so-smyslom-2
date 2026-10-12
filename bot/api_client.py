"""HTTP-клиент к нашему бэкенду. Бот никогда не ходит в LLM напрямую — только сюда."""

import logging
from typing import Any

import httpx

log = logging.getLogger(__name__)


class BackendError(Exception):
    """Ошибка, текст которой можно показать пользователю."""


class BackendClient:
    def __init__(
        self,
        base_url: str,
        timeout: float = 90.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        # transport нужен только тестам — чтобы ходить в FastAPI-приложение без сети
        self._http = httpx.AsyncClient(base_url=base_url, timeout=timeout, transport=transport)

    async def chat(self, message: str, user_id: str, history: list[dict] | None = None) -> str:
        body = {"message": message, "user_id": user_id, "channel": "bot", "history": history or []}
        return (await self._post("/chat", json=body))["answer"]

    async def ask(self, question: str, user_id: str) -> dict[str, Any]:
        body = {"question": question, "user_id": user_id, "channel": "bot"}
        return await self._post("/documents/ask", json=body)

    async def upload(self, filename: str, data: bytes) -> dict[str, Any]:
        return await self._post("/documents/upload", files={"file": (filename, data)})

    async def close(self) -> None:
        await self._http.aclose()

    async def _post(self, path: str, **kwargs: Any) -> dict[str, Any]:
        try:
            r = await self._http.post(path, **kwargs)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            try:
                detail = e.response.json().get("detail", e.response.text)
            except ValueError:
                detail = e.response.text
            log.warning("POST %s → %s: %s", path, e.response.status_code, detail)
            raise BackendError(f"Сервис ответил ошибкой: {detail}") from e
        except httpx.RequestError as e:
            log.error("POST %s: бэкенд недоступен: %s", path, e)
            raise BackendError("Сервис временно недоступен, попробуйте позже") from e
