"""Метрика умного поиска: 10 эталонных запросов → hit@3, время, доля фолбэков (T-13).

Запуск: make benchmark  или  uv run python scripts/benchmark.py [--repeat N]
Нужен работающий бэкенд с демо-анкетами (make seed). Запросы — data/demo/search_benchmark.json.
hit@3 — в первой тройке есть хоть один из ожидаемых волонтёров. Строже — «нашли из ждали»:
сколько ожидаемых вообще попало в тройку (у запроса их 2–3). Сверяем по имени анкеты,
поэтому лишние волонтёры в базе не мешают. Фолбэк — ни одна оценка не от LLM (ai=false).
--repeat N — прогнать каждый запрос N раз: видно, стабилен ли топ (для выбора запросов на сцену).
Итог печатается и строкой для таблицы в docs/METRICS.md.
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
TIMEOUT = 120  # секунд на запрос: разбор и переранжирование — два вызова LLM
RETRIES = 10  # обрыв соединения до ответа (бывает по пути до сервера) — пробуем ещё раз


last_seconds = 0.0  # сколько шла последняя удачная попытка call — без обрывов и пауз перед повтором


def call(method: str, path: str, body: dict | None = None):
    global last_seconds
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        BASE_URL + path, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    for attempt in range(RETRIES):
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                result = json.loads(response.read())
            last_seconds = time.perf_counter() - started
            return result
        except urllib.error.URLError as e:
            # ответ сервера (HTTPError) и таймаут не повторяем — запрос мог выполниться
            broken = isinstance(e.reason, (ssl.SSLError, ConnectionError))
            if isinstance(e, urllib.error.HTTPError) or not broken or attempt == RETRIES - 1:
                raise
            time.sleep(2)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # кириллица в консоли Windows и без make
    repeat = int(sys.argv[sys.argv.index("--repeat") + 1]) if "--repeat" in sys.argv else 1
    names = [f["name"] for f in json.loads((DEMO / "volunteers.json").read_text(encoding="utf-8"))]
    queries = json.loads((DEMO / "search_benchmark.json").read_text(encoding="utf-8"))["queries"]
    try:
        health = call("GET", "/health")
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"❌ Бэкенд {BASE_URL} недоступен ({e}). Запустите make up или make dev.")
        return 1
    in_base = {v["name"] for v in call("GET", "/volunteers")}
    if not set(names) <= in_base:
        print("❌ В базе нет демо-анкет. Запустите make seed.")
        return 1
    print(
        f"Модель: {health['llm_provider']} / {health['llm_model']}, эмбеддинги: {health['embeddings']}"
    )

    hits = runs = fallbacks = found = wanted = 0
    seconds = []
    for number, q in enumerate(queries, start=1):
        expected = {names[i - 1] for i in q["expected"]}
        results = []
        for _ in range(repeat):
            try:
                body = call("POST", "/search", {"query": q["query"]})
            except (urllib.error.URLError, TimeoutError) as e:
                print(f"❌ Запрос {number}: {e}")
                return 1
            seconds.append(last_seconds)
            top = [c["volunteer"]["name"] for c in body["candidates"][:3]]
            hit = bool(expected & set(top))
            fallback = not any(c["ai"] for c in body["candidates"])
            hits, runs, fallbacks = hits + hit, runs + 1, fallbacks + fallback
            found, wanted = found + len(expected & set(top)), wanted + len(expected)
            results.append((hit, fallback, top))
        marks = "".join("✅" if hit else "❌" for hit, _, _ in results)
        _, fallback, top = results[-1]
        print(f"\n{marks} {number}. {q['query']}")
        print(f"   ждали: {', '.join(sorted(expected))}")
        print(f"   топ-3: {', '.join(top) or '—'}{'  (без AI)' if fallback else ''}")

    average = sum(seconds) / len(seconds)
    print(
        f"\nhit@3: {hits} из {runs}, нашли {found} из {wanted} ожидаемых, "
        f"среднее время {average:.1f} с, фолбэков {fallbacks} из {runs}"
    )
    print("\nСтрока для docs/METRICS.md:")
    print(
        f"| {time.strftime('%Y-%m-%d')} | {health['llm_provider']} / {health['llm_model']} "
        f"| {health['embeddings']} | {hits}/{runs} | {found}/{wanted} | {average:.1f} с "
        f"| {fallbacks}/{runs} | |"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
