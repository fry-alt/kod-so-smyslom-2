#!/usr/bin/env bash
# Smoke-тест работающего бэкенда: /health, /chat, загрузка документа и вопрос по нему.
# Запуск: make smoke  или  bash scripts/smoke_test.sh https://my-domain/api
set -euo pipefail

BASE_URL="${1:-${BACKEND_URL:-http://localhost:8000}}"
TMP_DIR="$(mktemp -d)"
DOC="smoke_test.txt"
trap 'rm -rf "$TMP_DIR"; curl -fsS -X DELETE "$BASE_URL/documents/$DOC" >/dev/null 2>&1 || true' EXIT

ok() { echo "✅ $1"; }
fail() {
  echo "❌ $1"
  echo "   ответ: ${2:-}"
  exit 1
}

# JSON-тело передаём файлом: на Windows кириллица в аргументах curl.exe портится
post_json() {
  printf '%s' "$2" >"$TMP_DIR/body.json"
  curl -fsS -X POST "$BASE_URL$1" -H 'Content-Type: application/json' --data-binary "@$TMP_DIR/body.json"
}

echo "Smoke-тест: $BASE_URL"

health="$(curl -fsS "$BASE_URL/health")" || fail "/health недоступен" "$BASE_URL"
echo "$health" | grep -q '"status":"ok"' || fail "/health: статус не ok" "$health"
ok "/health → $health"

chat="$(post_json /chat '{"message": "Привет! Ответь одним словом.", "channel": "smoke"}')" ||
  fail "/chat вернул ошибку"
echo "$chat" | grep -q '"answer"' || fail "/chat: нет answer" "$chat"
ok "/chat"

printf 'Дежурный координатор по субботам — Пётр Смоков.\n\nОн принимает срочные заявки с 10:00 до 18:00.\n' >"$TMP_DIR/$DOC"
upload="$(curl -fsS -X POST "$BASE_URL/documents/upload" -F "file=@$TMP_DIR/$DOC")" ||
  fail "/documents/upload вернул ошибку"
echo "$upload" | grep -q '"chunks":[1-9]' || fail "/documents/upload: нет чанков" "$upload"
ok "/documents/upload → $upload"

ask="$(post_json /documents/ask '{"question": "Кто дежурный координатор по субботам?", "channel": "smoke"}')" ||
  fail "/documents/ask вернул ошибку"
echo "$ask" | grep -q '"found":true' || fail "/documents/ask: ответ не найден" "$ask"
echo "$ask" | grep -q "\"source\":\"$DOC\"" || fail "/documents/ask: нет ссылки на источник" "$ask"
ok "/documents/ask → ответ со ссылкой на $DOC"

echo "🎉 Smoke-тест пройден"
