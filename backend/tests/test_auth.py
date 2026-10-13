import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(tmp_path):
    (tmp_path / "index.html").write_text("<h1>Kanban Studio</h1>")
    return TestClient(create_app(tmp_path))


def login(client, username="user", password="password"):
    return client.post("/api/login", json={"username": username, "password": password})


def test_me_requires_login(client):
    assert client.get("/api/me").status_code == 401


def test_login_logout_flow(client):
    response = login(client)
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "httponly" in response.headers["set-cookie"].lower()

    assert client.get("/api/me").json() == {"username": "user"}

    assert client.post("/api/logout").status_code == 204
    assert client.get("/api/me").status_code == 401


@pytest.mark.parametrize(
    "username,password",
    [("user", "wrong"), ("other", "password"), ("", ""), ("USER", "password")],
)
def test_bad_credentials_rejected(client, username, password):
    assert login(client, username, password).status_code == 401
    assert client.get("/api/me").status_code == 401


def test_missing_fields_rejected(client):
    assert client.post("/api/login", json={"username": "user"}).status_code == 422
    assert client.post("/api/login").status_code == 422


def test_failed_login_keeps_existing_session(client):
    login(client)
    assert login(client, "user", "wrong").status_code == 401
    assert client.get("/api/me").status_code == 200


def test_tampered_cookie_rejected(client):
    login(client)
    cookie = client.cookies.get("session")
    client.cookies.set("session", cookie[:-3] + "abc")
    assert client.get("/api/me").status_code == 401


def test_sessions_are_per_client(client, tmp_path):
    login(client)
    other = TestClient(create_app(tmp_path))
    assert other.get("/api/me").status_code == 401


def test_logout_without_session_is_ok(client):
    assert client.post("/api/logout").status_code == 204
