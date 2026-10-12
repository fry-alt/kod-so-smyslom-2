# Один образ для backend, bot и web — отличаются только командой запуска в docker-compose.yml
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.15 /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# сначала только зависимости — слой кешируется, пока не меняется uv.lock
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-install-project --no-default-groups --group bot --group web

COPY backend ./backend
COPY bot ./bot
COPY web ./web
RUN uv sync --frozen --no-default-groups --group bot --group web

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
