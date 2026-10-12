from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlmodel import Session

from app.api.telegram_auth import telegram_user
from app.config import get_settings
from app.db import get_session
from app.models import Interaction
from app.rag.answer import answer_question
from app.rag.ingest import SUPPORTED_SUFFIXES, ingest_file
from app.rag.retrieve import delete_document, list_documents
from app.schemas import AskRequest, AskResponse, DocumentsInfo, TelegramUser, UploadResponse

router = APIRouter(prefix="/documents", tags=["documents"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


@router.get("", response_model=DocumentsInfo)
def documents() -> DocumentsInfo:
    return list_documents()


@router.post("/upload", response_model=UploadResponse)
def upload(file: UploadFile) -> UploadResponse:
    name = Path(file.filename or "").name  # отбрасываем путь из имени — защита от ../
    if Path(name).suffix.lower() not in SUPPORTED_SUFFIXES:
        raise HTTPException(400, f"Формат не поддерживается. Можно: {sorted(SUPPORTED_SUFFIXES)}")
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Файл больше 20 МБ")

    uploads = get_settings().uploads_dir
    uploads.mkdir(parents=True, exist_ok=True)
    path = uploads / name
    path.write_bytes(data)
    try:
        chunks = ingest_file(path, name)
    except ValueError as e:  # битый файл, неверная кодировка и т.п.
        raise HTTPException(400, f"Не удалось прочитать {name}: {e}") from e
    return UploadResponse(filename=name, chunks=chunks)


@router.delete("/{filename}")
def delete(filename: str) -> dict[str, int]:
    """Убрать файл из базы знаний (все его чанки и загруженную копию)."""
    deleted = delete_document(filename)
    if not deleted:
        raise HTTPException(404, f"Документ {filename} не найден")
    (get_settings().uploads_dir / Path(filename).name).unlink(missing_ok=True)
    return {"deleted": deleted}


@router.post("/ask", response_model=AskResponse)
def ask(
    req: AskRequest,
    session: Session = Depends(get_session),
    tg_user: TelegramUser | None = Depends(telegram_user),
) -> AskResponse:
    result = answer_question(req.question, req.top_k)
    session.add(
        Interaction(
            channel=req.channel,
            user_id=f"tg:{tg_user.id}" if tg_user else req.user_id,
            kind="ask",
            question=req.question,
            answer=result.answer,
        )
    )
    session.commit()
    return result
