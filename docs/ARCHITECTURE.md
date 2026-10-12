# Архитектура

## Компоненты

```mermaid
flowchart LR
    U1([Пользователь в Telegram]) --> BOT[bot<br/>aiogram 3]
    U2([Пользователь Mini App]) --> MA[miniapp<br/>React + Caddy :8080]
    U3([Жюри / сотрудник НКО]) --> WEB[web<br/>Streamlit :8501]

    BOT -- HTTP --> API
    MA -- "/api/* (проксирует Caddy)" --> API
    WEB -- HTTP --> API

    subgraph backend [backend — FastAPI :8000]
        API[api/*] --> SVC[services/case.py]
        API --> RAG[rag/<br/>ingest · retrieve · answer]
        SVC --> LLM[llm/client.py<br/>chat · chat_json · stream · embed]
        RAG --> LLM
        API --> DB[(SQLite<br/>журнал обращений)]
        RAG --> VDB[(Chroma<br/>data/chroma)]
    end

    LLM --> P{LLM_PROVIDER}
    P --> F[fake — без сети]
    P --> Y[YandexGPT<br/>AI Studio]
    P --> G[gpt2giga → GigaChat]
    P --> O[OpenAI-совместимый]
    P --> A[Anthropic]
```

В проде перед всем стоит Caddy (`deploy/Caddyfile`): `https://DOMAIN/` → Mini App (и `/api` через неё),
`https://DOMAIN/demo` → Streamlit. Без сервера — `make tunnel` (cloudflared) даёт временный https-адрес.

## Потоки данных

### Вопрос по документам (RAG)

```mermaid
sequenceDiagram
    participant C as Клиент (бот / Mini App / web)
    participant A as POST /documents/ask
    participant R as rag.retrieve
    participant V as Chroma
    participant L as LLM
    C->>A: {"question": "..."}
    A->>R: вопрос
    R->>L: embed(вопрос, kind=query)
    R->>V: top_k ближайших фрагментов
    V-->>R: фрагменты + сходство
    alt нет фрагментов выше RAG_MIN_SCORE
        A-->>C: found=false, «в документах нет ответа»
    else есть
        A->>L: chat_json(промпт rag_answer + фрагменты, RagAnswer)
        L-->>A: {"found", "answer", "sources": [1, 3]}
        A-->>C: ответ + цитаты источников
    end
```

### Загрузка документа

`POST /documents/upload` (или файл в бот) → `data/uploads/` → `rag.ingest.read_text` (PDF/DOCX/XLSX/CSV/TXT/MD)
→ `split_text` (абзацы → чанки ≤ CHUNK_SIZE) → `embed(kind=doc)` → Chroma (`source`, `chunk` в метаданных).
Повторная загрузка файла с тем же именем заменяет его чанки.

### Mini App и авторизация

Telegram открывает Mini App с подписанной строкой `initData`. Фронт шлёт её в заголовке
`X-Telegram-Init-Data`, бэкенд проверяет HMAC токеном бота (`api/telegram_auth.py`).
С `TELEGRAM_AUTH_REQUIRED=true` запросы без валидного initData отклоняются (401).

## Почему так

- **Один слой LLM на OpenAI SDK** — YandexGPT, GigaChat (через gpt2giga), vLLM/Ollama/OpenRouter
  отличаются только `base_url`, ключом и именем модели. Код промптов и сервисов не меняется.
- **`fake`-провайдер** — всё (включая CI и демо интерфейса) работает без ключей; эмбеддинги fake —
  хешированный «мешок слов», поэтому поиск по документам честно работает и без сети.
- **Бот и фронты — только через HTTP к бэкенду** — одна точка для логики, логов и ключей.
- **Caddy внутри контейнера miniapp** — фронт всегда ходит на относительный `/api`: нет CORS
  и разных адресов для локалки, туннеля и прода.
- **Коллекция Chroma на каждый бэкенд эмбеддингов** (`docs_fake`, `docs_yandex`, …) — векторы
  разной размерности не смешиваются; после смены провайдера — `make ingest`.
