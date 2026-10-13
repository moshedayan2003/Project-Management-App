def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_serves_index_html(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Kanban Studio" in response.text


def test_unknown_route_is_404(client):
    assert client.get("/api/nope").status_code == 404
    assert client.get("/nope").status_code == 404
