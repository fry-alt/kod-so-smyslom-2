#!/usr/bin/env bash
# Письма с кодом подтверждения почты — через Yandex Cloud Postbox Yapp на этом же сервере.
# Запускается при каждом деплое от пользователя deploy: берёт ключ Postbox и адрес отправителя из /opt/yapp/.env
# и дописывает их в ~/deti/.env. Имя отправителя — «Дети Марии», адрес — Yapp (его домен подтверждён в Postbox).
# Ключ остаётся на сервере и не попадает в GitHub.
# Нет Yapp или ключа — ничего не дописывает, регистрация идёт без кода на почту (MAIL_LOG_CODES=false).
set -euo pipefail
yapp_env=/opt/yapp/.env

key_id=$(sed -n 's/^POSTBOX_KEY_ID=//p' "$yapp_env" 2>/dev/null | head -n 1 || true)
secret=$(sed -n 's/^POSTBOX_SECRET=//p' "$yapp_env" 2>/dev/null | head -n 1 || true)
from=$(sed -n 's/^MAIL_FROM=//p' "$yapp_env" 2>/dev/null | head -n 1 || true)
# «Yapp <noreply@yyaapp.ru>» → noreply@yyaapp.ru
address=$(printf '%s' "$from" | sed -n 's/.*<\(.*\)>.*/\1/p')
address=${address:-$from}

if [ -z "$key_id" ] || [ -z "$secret" ] || [ -z "$address" ]; then
  echo "Почта: в $yapp_env нет POSTBOX_KEY_ID, POSTBOX_SECRET или MAIL_FROM — регистрация без кода на почту"
  exit 0
fi

printf 'POSTBOX_KEY_ID=%s\nPOSTBOX_SECRET=%s\nMAIL_FROM=Дети Марии <%s>\n' "$key_id" "$secret" "$address" >> ~/deti/.env
echo "Почта: коды подтверждения уходят с $address"
