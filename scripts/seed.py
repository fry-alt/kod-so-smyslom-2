"""Загрузить 40 демо-анкет через API бэкенда (бэкенд должен быть запущен).

Запуск: make seed  или  uv run python scripts/seed.py [--force]
Анкеты грузим только в пустую базу: тогда id волонтёра = номер анкеты в volunteers.json,
и эталонные запросы из search_benchmark.json указывают на нужных людей.
--force — загрузить, даже если в базе уже есть волонтёры (номера в бенчмарке разъедутся).
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")
FORMS = Path(__file__).resolve().parents[1] / "data" / "demo" / "volunteers.json"
TIMEOUT = 60  # секунд на анкету: с реальной LLM профиль строится несколько секунд


def call(method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        BASE_URL + path, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read())


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # кириллица в консоли Windows и без make
    try:
        existing = call("GET", "/volunteers")
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"❌ Бэкенд {BASE_URL} недоступен ({e}). Запустите make up или make dev.")
        return 1
    if existing and "--force" not in sys.argv:
        print(
            f"❌ В базе уже {len(existing)} волонтёров. Удалите data/app.db или запустите с --force."
        )
        return 1

    forms = json.loads(FORMS.read_text(encoding="utf-8"))
    for number, form in enumerate(forms, start=1):
        try:
            volunteer = call("POST", "/volunteers", form)
        except urllib.error.HTTPError as e:
            print(f"❌ Анкета {number} ({form['name']}): {e.code} {e.read().decode()}")
            return 1
        print(f"→ {number:2}. {form['name']} → id {volunteer['id']}")
    print(f"✅ Загружено анкет: {len(forms)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
