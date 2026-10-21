---
date: 2026-10-21
author: fry-alt
pr: напрямую
areas: [деплой]
---

# T-26: первая выкладка падала на сборке — чиним логин в ghcr.io

## Что изменилось
- Сборка на сервере идёт со своим пустым конфигом Docker (`~deploy/deti/.docker`).

## Зачем
Первая выкладка упала: `failed to fetch oauth token: denied`. В общем конфиге Docker на сервере лежит устаревший
логин Yapp в ghcr.io, и с ним ghcr не отдаёт даже публичный образ `ghcr.io/astral-sh/uv` из нашего Dockerfile.

## Где в коде
`.github/workflows/deploy.yml`, шаг «Сборка на сервере».

## Как проверить
Actions → Deploy зелёный, `https://deti.201-34-157-90.sslip.io/api/health` отвечает.

## Что осталось и на что обратить внимание
Ничего.
