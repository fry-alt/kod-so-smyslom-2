"""Промпты лежат рядом в .md-файлах. Переменные — в виде $name или ${name}.

load_prompt("rag_answer", context="...", question="...")
"""

from pathlib import Path
from string import Template

PROMPTS_DIR = Path(__file__).parent


def load_prompt(name: str, **variables: object) -> str:
    path = PROMPTS_DIR / f"{name}.md"
    if not path.exists():
        raise FileNotFoundError(f"Промпт не найден: {path}")
    try:
        return Template(path.read_text(encoding="utf-8")).substitute(variables).strip()
    except KeyError as e:
        raise KeyError(f"В промпт {name} не передана переменная {e}") from e
