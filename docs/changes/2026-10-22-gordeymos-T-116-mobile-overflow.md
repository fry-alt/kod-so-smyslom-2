---
date: 2026-10-22
author: gordeymos
task: T-116 (#116)
pr: https://github.com/fry-alt/kod-so-smyslom-2/pull/123
areas: [интерфейс]
---

# Убрать горизонтальное переполнение на узких экранах

## Что изменилось
- Контейнеры экранов и карточек теперь могут сжиматься внутри flex/grid без расширения страницы.
- На экране регистрации выбор роли становится одноколоночным до 360 px; заголовки панели и метки занятий переносятся.
- Длинные сообщения в чате и анкете могут переноситься; горизонтальная часть декоративной ленты главной обрезается в её контейнере.

## Где в коде
- `miniapp/src/App.tsx`, `ui.tsx`, `screens/admin/Messages.tsx`, `screens/admin/parts.tsx` — сжатие контейнеров сообщений и кабинета.
- `screens/Auth.tsx`, `screens/volunteer/Ask.tsx`, `Opportunities.tsx`, `Form.tsx`, `Welcome.tsx`, `VolunteerScenes.tsx`, `messages/Thread.tsx` — адаптивные элементы затронутых маршрутов.

## Как проверить
- `cd miniapp && npm run build` — TypeScript и production build проходят.
- `VITE_MOCK=1 npm run dev -- --host 127.0.0.1 --port 5176` — локальный preview с вымышленными данными.
- При ширине 320 px проверить `/login`, `/opportunities`, `/ask`, `/form` и `/admin`; при 768 px — `/`; при 390 px — `/admin/messages`.
- Проверены `documentElement.scrollWidth` и `body.scrollWidth` на всех семи маршрутах: значения совпали с шириной viewport (320, 768 или 390 px), горизонтального переполнения нет.

## Что осталось и на что обратить внимание
- Preview доступен на главной по адресу `http://127.0.0.1:5176/`.
