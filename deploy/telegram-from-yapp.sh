#!/usr/bin/env bash
# Бот и уведомления в Telegram — через прокси Yapp: сервер в России не достаёт до api.telegram.org,
# а Yapp ходит в Bot API через Cloudflare Worker (fry-alt/yapp, deploy/telegram-proxy.md).
# Запускается при каждом деплое от пользователя deploy: берёт TELEGRAM_API_BASE из /opt/yapp/.env
# и дописывает в ~/deti/.env. Адрес остаётся на сервере и не попадает в GitHub.
# Если TELEGRAM_API_BASE уже задан секретом репозитория — он важнее, ничего не трогаем.
# Нет Yapp или адреса — бот ходит в Telegram напрямую.
set -euo pipefail
yapp_env=/opt/yapp/.env

if grep -q '^TELEGRAM_API_BASE=.' ~/deti/.env 2>/dev/null; then
  echo "Telegram: прокси из секрета репозитория"
  exit 0
fi

base=$(sed -n 's/^TELEGRAM_API_BASE=//p' "$yapp_env" 2>/dev/null | head -n 1 || true)

if [ -z "$base" ]; then
  echo "Telegram: в $yapp_env нет TELEGRAM_API_BASE — бот ходит в api.telegram.org напрямую"
  exit 0
fi

printf 'TELEGRAM_API_BASE=%s\n' "$base" >> ~/deti/.env
# адрес в лог не пишем: лог деплоя публичный
echo "Telegram: через прокси Yapp"
