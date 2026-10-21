#!/usr/bin/env bash
# TURN для видеособеседований — coturn Yapp на этом же сервере (порт 3478, логины по общему секрету).
# Запускается при каждом деплое от пользователя deploy: берёт секрет из /opt/yapp/.env и дописывает
# TURN_URLS и TURN_SECRET в ~/deti/.env. Секрет остаётся на сервере и не попадает в GitHub.
# Нет Yapp или секрета — ничего не дописывает, звонки идут только через STUN.
set -euo pipefail
yapp_env=/opt/yapp/.env

secret=$(sed -n 's/^TURN_SECRET=//p' "$yapp_env" 2>/dev/null | head -n 1 || true)
domain=$(sed -n 's/^DOMAIN=//p' "$yapp_env" 2>/dev/null | head -n 1 || true)

if [ -z "$secret" ] || [ -z "$domain" ]; then
  echo "TURN: в $yapp_env нет TURN_SECRET или DOMAIN — звонки только через STUN"
  exit 0
fi

printf 'TURN_URLS=turn:%s:3478?transport=udp,turn:%s:3478?transport=tcp\nTURN_SECRET=%s\n' \
  "$domain" "$domain" "$secret" >> ~/deti/.env
echo "TURN: coturn Yapp на $domain"
