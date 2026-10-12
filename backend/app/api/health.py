from fastapi import APIRouter

from app.config import get_settings
from app.llm.client import get_llm
from app.llm.providers import LLMError, resolve_embeddings_provider
from app.rag.store import get_collection
from app.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    s = get_settings()
    try:
        model, error = get_llm().provider.model, None
    except LLMError as e:  # например, не задан ключ — сервис жив, но LLM не настроен
        model, error = "-", str(e)
    return HealthResponse(
        status="degraded" if error else "ok",
        llm_provider=s.llm_provider,
        llm_model=model,
        embeddings=resolve_embeddings_provider(s),
        documents=get_collection().count(),
        error=error,
    )
