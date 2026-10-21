from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.schemas import Quiz, QuizResult, QuizSubmit, TrainingModule
from app.services import training, volunteers

router = APIRouter(prefix="/training", tags=["training"])


def _module_or_404(module_id: str) -> TrainingModule:
    module = training.get_module(module_id)
    if module is None:
        raise HTTPException(404, f"Модуль {module_id} не найден")
    return module


@router.get("", response_model=list[TrainingModule])
def modules() -> list[TrainingModule]:
    """Учебные модули фонда из data/training/*.md."""
    return training.load_modules()


@router.get("/{module_id}/quiz", response_model=Quiz)
def quiz(module_id: str, session: Session = Depends(get_session)) -> Quiz:
    """Тест по модулю: 5 вопросов, без правильных ответов. Составляется один раз и кэшируется."""
    module = _module_or_404(module_id)
    return training.for_client(module.id, training.get_quiz(session, module))


@router.post("/submit", response_model=QuizResult)
def submit(data: QuizSubmit, session: Session = Depends(get_session)) -> QuizResult:
    """Проверка теста: балл, сдан ли (от 70%), новый статус волонтёра."""
    volunteer = volunteers.get(session, data.volunteer_id)
    if volunteer is None:
        raise HTTPException(404, f"Волонтёр {data.volunteer_id} не найден")
    return training.submit(session, volunteer, _module_or_404(data.module_id), data.answers)
