---
date: 2026-10-21
author: gordeymos
task: T-19 (#19)
pr: (ссылка появится после открытия PR)
areas: [интерфейс, деплой]
---

# Android-приложение (APK) из того же кода через Capacitor

## Что изменилось
- Приложение волонтёра теперь есть как APK «Дети Марии» с иконкой фонда: анкета, обучение, статус — те же экраны, что на сайте и в Telegram.
- APK собирается в GitHub Actions на каждый PR и мерж, затрагивающий `miniapp/`: Actions → «Android APK» → Artifacts → `deti-marii-apk`. Java и Android SDK у себя ставить не нужно.
- Кнопка «Назад» на телефоне возвращает на предыдущий экран, а не закрывает приложение (`@capacitor/app`).
- Страница не залезает под вырез и системные панели: отступы `env(safe-area-inset-*)` у `body`. В браузере и Telegram они нулевые, ничего не меняется.

## Где в коде
- **Новые зависимости** (нужны по задаче, версии зафиксированы): `@capacitor/core`, `@capacitor/android` 8.5.3, `@capacitor/app` 8.1.2, dev — `@capacitor/cli` 8.5.3.
- `miniapp/capacitor.config.json` — id `ru.detimarii.volunteers`, имя «Дети Марии», сайт берётся из `dist/`.
- `miniapp/android/` — Android-проект (сгенерирован `npx cap add android`). Своё: иконки `mipmap-*` из `public/icons`, цвета фонда `values/colors.xml`, заставка `drawable/splash.xml` (фон приложения + сердце) вместо картинок Capacitor.
- `miniapp/vite.config.ts` — в режиме `android` фронт ходит в API прода по полному адресу (`PROD_API`), потому что открывается из файлов APK, а не с сайта. Обычная сборка не изменилась (относительный `/api`).
- `miniapp/package.json` — скрипт `npm run build:android` (сборка с `--mode android` + `cap sync android`).
- `.github/workflows/android.yml` — сборка APK (Node 24, JDK 21, `./gradlew assembleDebug`).
- `miniapp/.dockerignore` — `android/` не попадает в Docker-образ сайта. README — раздел «Android-приложение (APK)».
- Контракт API не менялся. Бэкенд уже разрешает CORS со всех адресов (`CORS_ORIGINS=*`), это нужно APK.

## Как проверить
1. В PR — зелёная проверка «Сборка APK», в ней артефакт `deti-marii-apk`.
2. Скачать zip, поставить `app-debug.apk` на Android (разрешить установку из этого источника).
3. Открыть «Дети Марии», пройти анкету и отправить её — откроется страница статуса. После перезапуска приложения статус на месте.
4. Локально: `cd miniapp && npm run build` и `npm run build:android` проходят.

## Что осталось и на что обратить внимание
- APK ходит в бэкенд прода. Пока прод недоступен (на сервере кончилось место, см. деплой), анкета в APK покажет «Нет связи с сервером».
- Подпись debug: ставится напрямую, но не годится для Google Play. Для магазина нужен свой ключ (release-сборка) — это уже после хакатона.
- Сменится домен — поменять `PROD_API` в `miniapp/vite.config.ts`.
- iOS не собирали: нужен Mac с Xcode (`npx cap add ios`).
