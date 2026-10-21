from fastapi import APIRouter

from app.schemas import Role
from app.services.roles import load_roles

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[Role])
def roles() -> list[Role]:
    """Роли фонда из data/roles.json."""
    return load_roles()
