import os
import tempfile
from pathlib import Path

# The module-level app needs a static dir and a throwaway DB at import time.
os.environ.setdefault("STATIC_DIR", str(Path(__file__).parent))
os.environ.setdefault("DB_PATH", str(Path(tempfile.mkdtemp()) / "import.db"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402
from app.services import passwords  # noqa: E402


@pytest.fixture(autouse=True)
def fast_password_hashing(monkeypatch):
    """Real scrypt, but a tiny work factor so the suite stays fast."""
    monkeypatch.setattr(passwords, "COST", 2**4)


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "test.db"


@pytest.fixture
def make_client(tmp_path, db_path):
    (tmp_path / "index.html").write_text("<h1>Kanban Studio</h1>")

    def make():
        return TestClient(create_app(tmp_path, db_path))

    return make


@pytest.fixture
def client(make_client):
    """Signed-out client."""
    return make_client()


def login(client, username="user", password="password"):
    return client.post("/api/login", json={"username": username, "password": password})


@pytest.fixture
def auth_client(client):
    """Client signed in as the demo user."""
    assert login(client).status_code == 200
    return client


@pytest.fixture
def board_url(auth_client):
    """URL of the demo user's board (the default demo board)."""
    return f"/api/boards/{auth_client.get('/api/boards').json()[0]['id']}"
