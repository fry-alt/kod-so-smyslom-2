"""Прогон 10 типовых вопросов «Спроси о фонде» через API бэкенда (бэкенд должен быть запущен,
документы загружены: make ingest).

Запуск: uv run python scripts/rag_check.py
Для каждого вопроса печатает ответ и источники. Вопрос засчитан, если:
- ответ есть в документах — found=true и среди источников есть ожидаемый файл;
- ответа нет — found=false (честное «не знаю»).
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")
QUESTIONS = Path(__file__).resolve().parents[1] / "data" / "demo" / "rag_questions.json"
TIMEOUT = 60  # секунд на вопрос: с реальной LLM ответ готовится несколько секунд


def ask(question: str) -> dict:
    body = json.dumps({"question": question, "channel": "rag_check"}).encode()
    request = urllib.request.Request(
        BASE_URL + "/documents/ask",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read())


def is_ok(result: dict, expected: list[str]) -> bool:
    if not expected:
        return not result["found"]
    return result["found"] and any(s["source"] in expected for s in result["sources"])


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # кириллица в консоли Windows и без make
    questions = json.loads(QUESTIONS.read_text(encoding="utf-8"))["questions"]
    passed = 0
    for number, q in enumerate(questions, start=1):
        try:
            result = ask(q["question"])
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"❌ Бэкенд {BASE_URL} недоступен ({e}). Запустите make dev и make ingest.")
            return 1
        ok = is_ok(result, q["expected"])
        passed += ok
        sources = ", ".join(s["source"] for s in result["sources"]) or "—"
        wanted = ", ".join(q["expected"]) or "«не знаю»"
        print(f"{'✅' if ok else '❌'} {number:2}. {q['question']}")
        print(f"      ответ: {result['answer']}")
        print(f"      источники: {sources}   (ждём: {wanted})")
    print(f"\nИтого: {passed} из {len(questions)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
