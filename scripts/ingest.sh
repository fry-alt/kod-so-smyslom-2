#!/usr/bin/env bash
# Загрузить файлы в базу знаний через API бэкенда (бэкенд должен быть запущен).
# Запуск: make ingest  или  bash scripts/ingest.sh папка [папка ...]
set -euo pipefail

BASE_URL="${BACKEND_URL:-http://localhost:8000}"

curl -fsS "$BASE_URL/health" >/dev/null || {
  echo "❌ Бэкенд $BASE_URL недоступен. Запустите make up или make dev."
  exit 1
}

count=0
for dir in "${@:-data/demo}"; do
  for file in "$dir"/*; do
    case "${file,,}" in
    *.pdf | *.docx | *.xlsx | *.csv | *.txt | *.md) ;;
    *) continue ;;
    esac
    echo "→ $(basename "$file"): $(curl -fsS -X POST "$BASE_URL/documents/upload" -F "file=@$file")"
    count=$((count + 1))
  done
done
echo "✅ Загружено файлов: $count"
