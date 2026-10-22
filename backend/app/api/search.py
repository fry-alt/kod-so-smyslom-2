from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.api.auth import coordinator
from app.db import get_session
from app.schemas import SearchRequest, SearchResponse
from app.services.search import SearchError, search

router = APIRouter(prefix="/search", tags=["search"], dependencies=[Depends(coordinator)])


@router.post("", response_model=SearchResponse)
def run(req: SearchRequest, session: Session = Depends(get_session)) -> SearchResponse:
    """Умный поиск: запрос словами или роль → топ кандидатов с объяснением."""
    try:
        return search(session, req)
    except SearchError as e:
        raise HTTPException(e.status, str(e)) from e
