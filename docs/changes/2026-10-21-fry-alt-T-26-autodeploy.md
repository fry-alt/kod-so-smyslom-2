---
date: 2026-10-21
author: fry-alt
pr: напрямую
areas: [деплой]
---

# T-26: каждый мерж в main сам выкладывается на сервер

## Что изменилось
- Мерж в `main` → GitHub Actions «Deploy» → сайт обновлён через 2–5 минут:
  **https://deti.201-34-157-90.sslip.io** (Mini App, `/admin`), `/api/health` — бэкенд, `/demo` — Streamlit.
- Сервер тот же, что у Yapp (Timeweb, 1 vCPU / 2 ГБ). Стек живёт в `~deploy/deti`, у контейнеров лимиты памяти,
  чтобы не мешать Yapp. Образы собираются прямо на сервере (слои кешируются), реестр образов не нужен.
- HTTPS отдаёт Caddy от Yapp: наш деплой кладёт `/opt/yapp/sites/deti.caddy`. Разово подключает папку `sites/`
  скрипт `deploy/attach-to-yapp-caddy.sh` (та же правка внесена в репозиторий Yapp).
- `make deploy` теперь просто перезапускает этот workflow для `main` (нужен `gh`). `DEPLOY_HOST`/`DEPLOY_DIR`
  из `.env.example` убраны.

## Зачем
Чтобы оба видели свои изменения на живом https-адресе сразу после мержа — и для Telegram Mini App (#12),
которой нужен https.

## Где в коде
- `.github/workflows/deploy.yml` — выкладка; переменная репозитория `DEPLOY_HOST`, окружение `production`
  (секреты `SSH_KEY`, `SSH_KNOWN_HOSTS`, необязательный `APP_ENV`).
- `deploy/docker-compose.prod.yml` — прод-стек, `deploy/deti.caddy` — наш сайт в Caddy Yapp.
- `Makefile` (`deploy`), `README.md` (раздел «Деплой на сервер»).

## Как проверить
Actions → Deploy зелёный, `curl https://deti.201-34-157-90.sslip.io/api/health` отвечает.

## Что осталось и на что обратить внимание
- На проде `LLM_PROVIDER=fake`. Реальный LLM и токен бота — строками в секрет `APP_ENV`:
  `gh secret set APP_ENV --env production < prod.env`, потом `make deploy`.
- Деплой не гоняет тесты — полагаемся на зелёный CI в PR. Сломанный `main` = сломанный сайт.
- Данные (`data/app.db`, Chroma) живут на сервере в `~deploy/deti/data` и между выкладками сохраняются.
  Файлы из `data/` репозитория при каждой выкладке копируются поверх.
- `deploy/` — зона B: @gordeymos, посмотри, пожалуйста. Бот с кнопкой Mini App и PWA остаются в #12.
