from fastapi.testclient import TestClient

from app.main import create_app


def make_client(tmp_path):
    (tmp_path / "index.html").write_text("<h1>Kanban Studio</h1>")
    return TestClient(create_app(tmp_path))


def test_health(tmp_path):
    response = make_client(tmp_path).get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_serves_index_html(tmp_path):
    response = make_client(tmp_path).get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Kanban Studio" in response.text


def test_unknown_route_is_404(tmp_path):
    client = make_client(tmp_path)
    assert client.get("/api/nope").status_code == 404
    assert client.get("/nope").status_code == 404
