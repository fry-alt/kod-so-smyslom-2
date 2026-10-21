"""Загрузить 40 демо-анкет и 8 возможностей через API бэкенда (бэкенд должен быть запущен).

Запуск: make seed  или  uv run python scripts/seed.py [--force]
Анкеты грузим только в пустую базу: тогда id волонтёра = номер анкеты в volunteers.json,
и эталонные запросы из search_benchmark.json указывают на нужных людей.
--force — загрузить, даже если в базе уже есть волонтёры (номера в бенчмарке разъедутся).
--resume — дозагрузить после обрыва связи: анкеты, чьи имена уже есть в базе, пропускаем.
Возможности грузим, если каталог пуст, — независимо от анкет.
"""

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")
DEMO = Path(__file__).resolve().parents[1] / "data" / "demo"
FORMS = DEMO / "volunteers.json"
OPPORTUNITIES = DEMO / "opportunities.json"
TIMEOUT = 60  # секунд на анкету: с реальной LLM профиль строится несколько секунд
RETRIES = 10  # обрыв соединения до ответа (бывает по пути до сервера) — пробуем ещё раз


def call(method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        BASE_URL + path, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                return json.loads(response.read())
        except urllib.error.URLError as e:
            # ответ сервера (HTTPError) и таймаут не повторяем — запрос мог выполниться
            broken = isinstance(e.reason, (ssl.SSLError, ConnectionError))
            if isinstance(e, urllib.error.HTTPError) or not broken or attempt == RETRIES - 1:
                raise
            time.sleep(2)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # кириллица в консоли Windows и без make
    try:
        existing = call("GET", "/volunteers")
        catalog = call("GET", "/opportunities")
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"❌ Бэкенд {BASE_URL} недоступен ({e}). Запустите make up или make dev.")
        return 1
    resume = "--resume" in sys.argv
    if existing and "--force" not in sys.argv and not resume:
        print(
            f"❌ В базе уже {len(existing)} волонтёров. Удалите data/app.db или запустите с --force."
        )
        return 1

    forms = json.loads(FORMS.read_text(encoding="utf-8"))
    loaded = {v["name"] for v in existing} if resume else set()
    for number, form in enumerate(forms, start=1):
        if form["name"] in loaded:
            continue
        try:
            volunteer = call("POST", "/volunteers", form)
        except urllib.error.HTTPError as e:
            print(f"❌ Анкета {number} ({form['name']}): {e.code} {e.read().decode()}")
            return 1
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"❌ Анкета {number} ({form['name']}): связь оборвалась ({e}).")
            print("   Проверьте, не загрузилась ли она, и запустите ещё раз с --resume.")
            return 1
        print(f"→ {number:2}. {form['name']} → id {volunteer['id']}")
    print(f"✅ Загружено анкет: {len(forms)}")

    if catalog:
        print(f"ℹ️ В каталоге уже {len(catalog)} возможностей — демо-возможности не добавляю.")
        return 0
    items = json.loads(OPPORTUNITIES.read_text(encoding="utf-8"))
    for item in items:
        try:
            call("POST", "/opportunities", item)
        except urllib.error.HTTPError as e:
            print(f"❌ Возможность «{item['title']}»: {e.code} {e.read().decode()}")
            return 1
    print(f"✅ Загружено возможностей: {len(items)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
