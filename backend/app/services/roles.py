"""Роли волонтёров из рабочего файла фонда data/roles.json."""

import json

from app.config import get_settings
from app.schemas import Role


def load_roles() -> list[Role]:
    """Пустой список, если файла ещё нет. Битый файл — ошибка: лучше узнать сразу."""
    path = get_settings().data_dir / "roles.json"
    if not path.exists():
        return []
    return [Role.model_validate(r) for r in json.loads(path.read_text(encoding="utf-8"))]
