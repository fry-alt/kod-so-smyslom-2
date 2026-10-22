from fastapi import APIRouter, Depends

from app.api.auth import coordinator
from app.services.case import CaseInput, CaseResult, run_case

router = APIRouter(prefix="/case", tags=["case"], dependencies=[Depends(coordinator)])


@router.post("/run", response_model=CaseResult)
def run(data: CaseInput) -> CaseResult:
    return run_case(data)
