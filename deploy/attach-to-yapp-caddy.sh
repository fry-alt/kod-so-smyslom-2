#!/usr/bin/env bash
# Разово подключает папку /opt/yapp/sites к Caddy от Yapp, чтобы он раздавал и наш сайт.
# Запускается при каждом деплое от пользователя deploy; если уже подключено — ничего не делает.
# То же изменение внесено в репозиторий Yapp (deploy/Caddyfile и deploy/docker-compose.yml),
# поэтому выкладки Yapp его не затирают.
set -euo pipefail
cd /opt/yapp
mkdir -p sites

if grep -q '/etc/caddy/sites' docker-compose.yml; then
  echo "Caddy Yapp уже подключает sites/"
  exit 0
fi

grep -q 'import /etc/caddy/sites' Caddyfile ||
  printf '\n# Другие сайты на этом сервере (хакатон «Дети Марии»): файлы sites/*.caddy\nimport /etc/caddy/sites/*.caddy\n' >> Caddyfile

# Проверяем конфиг отдельным контейнером, прежде чем перезапускать Caddy, на котором живёт Yapp.
if ! docker run --rm -e DOMAIN=example.com \
  -v /opt/yapp/Caddyfile:/etc/caddy/Caddyfile:ro -v /opt/yapp/sites:/etc/caddy/sites:ro \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
  sed -i '/хакатон «Дети Марии»/d; /import \/etc\/caddy\/sites/d' Caddyfile
  echo "Конфиг Caddy не прошёл проверку, Caddyfile Yapp возвращён как был" >&2
  exit 1
fi

sed -i 's|^      - caddy-config:/config$|&\n      - ./sites:/etc/caddy/sites:ro|' docker-compose.yml
grep -q '/etc/caddy/sites' docker-compose.yml || { echo "Не нашёл, куда добавить том sites в docker-compose.yml Yapp" >&2; exit 1; }
docker compose up -d --no-deps caddy
echo "Caddy Yapp перезапущен с папкой sites/"
