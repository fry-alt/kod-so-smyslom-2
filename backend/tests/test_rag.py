from app.rag.ingest import ingest_path, read_text, split_text
from conftest import DEMO_DIR


def test_split_text_respects_size():
    text = "\n\n".join(f"Абзац номер {i}. " * 5 for i in range(30))
    chunks = split_text(text, size=300, overlap=50)
    assert len(chunks) > 1
    assert all(len(c) <= 300 for c in chunks)


def test_readers_extract_text_from_all_demo_formats():
    for name in ("annual_report_2025.docx", "volunteer_shifts.xlsx", "events.csv", "faq.md"):
        assert len(read_text(DEMO_DIR / name)) > 100, name
    assert "координатор: Анна" in read_text(DEMO_DIR / "volunteer_shifts.xlsx")


def test_ask_finds_answer_with_source(client):
    counts = ingest_path(DEMO_DIR)
    assert len(counts) >= 5 and all(counts.values())

    r = client.post("/documents/ask", json={"question": "Как стать волонтёром фонда?"})
    assert r.status_code == 200
    body = r.json()
    assert body["found"] is True
    assert body["sources"][0]["source"] == "volunteer_rules.md"


def test_ask_says_dont_know_when_no_data(client):
    ingest_path(DEMO_DIR)
    r = client.post("/documents/ask", json={"question": "Квантовая хромодинамика глюонов"})
    assert r.json()["found"] is False
    assert r.json()["sources"] == []


def test_ask_on_empty_index(client):
    r = client.post("/documents/ask", json={"question": "Что угодно"})
    assert r.json()["found"] is False


def test_upload_and_list(client):
    files = {"file": ("rules.txt", "Смена волонтёра длится два часа.".encode(), "text/plain")}
    r = client.post("/documents/upload", files=files)
    assert r.status_code == 200
    assert r.json() == {"filename": "rules.txt", "chunks": 1}
    assert client.get("/documents").json()["files"] == ["rules.txt"]

    # повторная загрузка того же файла не дублирует чанки
    client.post("/documents/upload", files=files)
    assert client.get("/documents").json()["chunks"] == 1

    assert client.delete("/documents/rules.txt").json() == {"deleted": 1}
    assert client.get("/documents").json()["files"] == []
    assert client.delete("/documents/rules.txt").status_code == 404


def test_upload_rejects_unknown_format(client):
    r = client.post(
        "/documents/upload", files={"file": ("x.exe", b"MZ", "application/octet-stream")}
    )
    assert r.status_code == 400
