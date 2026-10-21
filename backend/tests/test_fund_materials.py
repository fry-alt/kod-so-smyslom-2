"""Материалы фонда: роли (data/roles.json) и учебные модули (data/training/*.md)."""

from pathlib import Path

from app.services.roles import load_roles
from app.services.training import get_module, load_modules

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DRAFT_MARK = "> ЧЕРНОВИК — заменить текстом фонда"


def use_repo_data(monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(DATA_DIR))
    from app.config import get_settings

    get_settings.cache_clear()


def test_roles_file_is_valid(monkeypatch):
    use_repo_data(monkeypatch)
    roles = load_roles()
    assert len(roles) >= 8
    codes = [r.code for r in roles]
    assert len(codes) == len(set(codes))
    for role in roles:
        assert role.skills and role.availability, role.code
    assert any(r.format == "online" for r in roles)


def test_roles_endpoint_reads_repo_file(client, monkeypatch):
    use_repo_data(monkeypatch)
    codes = [r["code"] for r in client.get("/roles").json()]
    assert "photographer" in codes


def test_training_modules_are_valid(monkeypatch):
    use_repo_data(monkeypatch)
    modules = load_modules()
    assert len(modules) >= 3
    assert sum(m.required for m in modules) >= 3
    assert any(not m.required for m in modules)  # есть и дополнительные
    for m in modules:
        assert m.title and not m.title.startswith("---")
        assert len(m.text) > 500, m.id  # хватает текста на тест из 5 вопросов
        assert "required:" not in m.text  # шапка не попала в текст


def test_drafts_are_marked(monkeypatch):
    use_repo_data(monkeypatch)
    for m in load_modules():
        assert m.text.startswith(DRAFT_MARK), f"{m.id}: уберите проверку, когда придёт текст фонда"


def test_module_front_matter(tmp_path, monkeypatch):
    folder = tmp_path / "training"
    folder.mkdir()
    (folder / "01-about.md").write_text(
        "---\ntitle: О фонде\nrequired: true\n---\n\nТекст про фонд.\n", encoding="utf-8"
    )
    (folder / "02-extra.md").write_text(
        "---\ntitle: Для любопытных\nrequired: false\n---\nЕщё текст.", encoding="utf-8"
    )
    (folder / "03-plain.md").write_text("Без шапки.", encoding="utf-8")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from app.config import get_settings

    get_settings.cache_clear()

    about, extra, plain = load_modules()
    assert (about.id, about.title, about.required, about.text) == (
        "01-about",
        "О фонде",
        True,
        "Текст про фонд.",
    )
    assert (extra.title, extra.required) == ("Для любопытных", False)
    assert (plain.title, plain.required, plain.text) == ("03-plain", True, "Без шапки.")
    assert get_module("02-extra") == extra
    assert get_module("nope") is None
