"""Обучение волонтёров: учебные модули из data/training/*.md.

Файл модуля начинается с шапки:
    ---
    title: О фонде «Дети Марии»
    required: true
    ---
required: false — дополнительный модуль, на статус «обучение пройдено» не влияет.
Порядок модулей — по имени файла (01-…, 02-…), id модуля — имя файла без .md.
"""

from pathlib import Path

from app.config import get_settings
from app.schemas import TrainingModule


def load_modules() -> list[TrainingModule]:
    folder = get_settings().data_dir / "training"
    return [_read(path) for path in sorted(folder.glob("*.md"))]


def get_module(module_id: str) -> TrainingModule | None:
    return next((m for m in load_modules() if m.id == module_id), None)


def _read(path: Path) -> TrainingModule:
    text = path.read_text(encoding="utf-8")
    meta: dict[str, str] = {}
    if text.startswith("---\n"):
        header, _, text = text.removeprefix("---\n").partition("\n---\n")
        for line in header.splitlines():
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
    return TrainingModule(
        id=path.stem,
        title=meta.get("title") or path.stem,
        text=text.strip(),
        required=meta.get("required", "true").lower() != "false",
    )
