#!/usr/bin/env bash
# Загрузить файлы в базу знаний через API бэкенда (бэкенд должен быть запущен).
# Запуск: make ingest  или  bash scripts/ingest.sh path/to/folder
set -euo pipefail

DIR="${1:-data/demo}"
BASE_URL="${BACKEND_URL:-http://localhost:8000}"

curl -fsS "$BASE_URL/health" >/dev/null || {
  echo "❌ Бэкенд $BASE_URL недоступен. Запустите make up или make dev."
  exit 1
}

count=0
for file in "$DIR"/*; do
  case "${file,,}" in
  *.pdf | *.docx | *.xlsx | *.csv | *.txt | *.md) ;;
  *) continue ;;
  esac
  echo "→ $(basename "$file"): $(curl -fsS -X POST "$BASE_URL/documents/upload" -F "file=@$file")"
  count=$((count + 1))
done
echo "✅ Загружено файлов: $count"
