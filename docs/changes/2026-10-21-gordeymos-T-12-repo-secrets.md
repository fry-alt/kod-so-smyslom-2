---
date: 2026-10-21
author: gordeymos
task: T-12 (#12)
pr: см. PR по ветке b/T-12-repo-secrets
areas: [деплой]
---

# Ключи для прода — отдельными секретами репозитория вместо одного APP_ENV

## Что изменилось
- Выкладка собирает `.env` для сервера из **отдельных секретов репозитория**: `TELEGRAM_BOT_TOKEN`, `YANDEX_API_KEY`, `YANDEX_FOLDER_ID`, `GIGACHAT_CREDENTIALS`, `GPT2GIGA_API_KEY`, `LLM_API_KEY`, `ANTHROPIC_API_KEY`.
- Настройки без секретов — **переменные репозитория**: `LLM_PROVIDER` (по умолчанию `fake`), `LLM_MODEL`, `LLM_BASE_URL`, `YANDEX_MODEL`, `GIGACHAT_MODEL`.
- Пустые значения в `.env` не попадают. В логе выкладки — только имена того, что подхватилось, без значений.
- Секрет окружения `APP_ENV` больше не читается (его так и не создали).

## Зачем
Один `APP_ENV` на все ключи `gh secret set` перезаписывает целиком, а прочитать его нельзя — добавив токен бота, легко стереть ключи LLM. Отдельные секреты меняются независимо.

## Где в коде
- `.github/workflows/deploy.yml` — шаг «Конфиг сервера» и список секретов/переменных в шапке.
- `README.md` — раздел «Деплой на сервер».

## Как проверить
- `gh secret set TELEGRAM_BOT_TOKEN -R fry-alt/kod-so-smyslom-2` → `make deploy` → в логе шага «Конфиг сервера»: `В .env на сервере: … TELEGRAM_BOT_TOKEN`.
- Локально шаг прогнан на фейковых значениях: пустые секреты пропускаются, `LLM_PROVIDER=fake` по умолчанию.

## Что осталось и на что обратить внимание
- @fry-alt: ключи LLM — теперь `gh secret set YANDEX_API_KEY` и т.д., провайдер — `gh variable set LLM_PROVIDER --body yandex`.
- В личном репозитории секреты может создавать только владелец (fry-alt).
