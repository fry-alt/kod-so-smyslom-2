from fastapi import APIRouter

from app.services.case import CaseInput, CaseResult, run_case

router = APIRouter(prefix="/case", tags=["case"])


@router.post("/run", response_model=CaseResult)
def run(data: CaseInput) -> CaseResult:
    return run_case(data)
