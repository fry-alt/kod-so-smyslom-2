"""Веб-демо на Streamlit: чат, загрузка документов и вопросы по ним.

Запуск: make dev-web  (uv run streamlit run web/streamlit_app.py)
Как и бот, ходит только в наш бэкенд по HTTP.
"""

import json
import os
from collections.abc import Iterator

import httpx
import streamlit as st

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
TIMEOUT = 90.0

st.set_page_config(page_title="Помощник НКО", page_icon="🤝", layout="centered")


def backend_error(e: Exception) -> str:
    if isinstance(e, httpx.HTTPStatusError):
        try:
            return f"Ошибка сервиса: {e.response.json().get('detail')}"
        except ValueError:
            return f"Ошибка сервиса: HTTP {e.response.status_code}"
    return f"Бэкенд недоступен ({BACKEND_URL}): {e}"


def stream_chat(message: str, history: list[dict]) -> Iterator[str]:
    body = {"message": message, "history": history, "channel": "web"}
    with httpx.stream("POST", f"{BACKEND_URL}/chat/stream", json=body, timeout=TIMEOUT) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if not line.startswith("data: ") or line == "data: [DONE]":
                continue
            event = json.loads(line.removeprefix("data: "))
            if "error" in event:
                yield f"\n\n⚠️ {event['error']}"
            else:
                yield event["delta"]


# --- боковая панель: статус и документы ---
with st.sidebar:
    st.header("Статус")
    try:
        health = httpx.get(f"{BACKEND_URL}/health", timeout=5).json()
        st.success(f"LLM: {health['llm_provider']} / {health['llm_model']}")
        st.caption(f"Фрагментов в базе знаний: {health['documents']}")
        if health.get("error"):
            st.warning(health["error"])
    except httpx.HTTPError as e:
        st.error(backend_error(e))

    st.header("Документы")
    uploaded = st.file_uploader(
        "PDF, DOCX, XLSX, CSV, TXT, MD", type=["pdf", "docx", "xlsx", "csv", "txt", "md"]
    )
    if uploaded and st.button("Загрузить в базу знаний"):
        try:
            r = httpx.post(
                f"{BACKEND_URL}/documents/upload",
                files={"file": (uploaded.name, uploaded.getvalue())},
                timeout=TIMEOUT,
            )
            r.raise_for_status()
            st.success(f"{uploaded.name}: {r.json()['chunks']} фрагм.")
        except httpx.HTTPError as e:
            st.error(backend_error(e))

st.title("🤝 Помощник НКО")
tab_docs, tab_chat = st.tabs(["📚 Вопрос по документам", "💬 Чат"])

with tab_docs:
    question = st.text_input("Ваш вопрос", placeholder="Как стать волонтёром?")
    if st.button("Спросить", type="primary") and question:
        with st.spinner("Ищу в документах…"):
            try:
                r = httpx.post(
                    f"{BACKEND_URL}/documents/ask",
                    json={"question": question, "channel": "web"},
                    timeout=TIMEOUT,
                )
                r.raise_for_status()
                result = r.json()
            except httpx.HTTPError as e:
                st.error(backend_error(e))
                result = None
        if result:
            (st.success if result["found"] else st.info)(result["answer"])
            for s in result["sources"]:
                with st.expander(f"📄 {s['source']} · фрагмент {s['chunk']} · {s['score']:.2f}"):
                    st.write(s["text"])

with tab_chat:
    if "history" not in st.session_state:
        st.session_state.history = []
    for msg in st.session_state.history:
        st.chat_message(msg["role"]).write(msg["content"])
    if prompt := st.chat_input("Напишите сообщение"):
        st.chat_message("user").write(prompt)
        try:
            answer = st.chat_message("assistant").write_stream(
                stream_chat(prompt, st.session_state.history)
            )
            st.session_state.history += [
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": answer},
            ]
        except httpx.HTTPError as e:
            st.error(backend_error(e))
