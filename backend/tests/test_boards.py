import pytest

from app.models.board import empty_board


def test_list_boards(auth_client):
    [board] = auth_client.get("/api/boards").json()
    assert board["name"] == "My board"
    assert board["card_count"] == 8
    assert set(board) == {"id", "name", "created_at", "updated_at", "card_count"}


def test_create_board_starts_empty(auth_client):
    response = auth_client.post("/api/boards", json={"name": "  Launch plan  "})
    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Launch plan" and created["card_count"] == 0
    assert auth_client.get(f"/api/boards/{created['id']}").json() == empty_board().model_dump(mode="json")
    assert [b["name"] for b in auth_client.get("/api/boards").json()] == ["My board", "Launch plan"]


@pytest.mark.parametrize("name", ["", "   ", "x" * 61])
def test_board_name_validation(auth_client, board_url, name):
    assert auth_client.post("/api/boards", json={"name": name}).status_code == 422
    assert auth_client.patch(board_url, json={"name": name}).status_code == 422
    assert len(auth_client.get("/api/boards").json()) == 1


def test_rename_board(auth_client, board_url):
    response = auth_client.patch(board_url, json={"name": "Roadmap"})
    assert response.status_code == 200
    assert response.json()["name"] == "Roadmap"
    assert auth_client.get("/api/boards").json()[0]["name"] == "Roadmap"
    assert len(auth_client.get(board_url).json()["cards"]) == 8  # content unchanged


def test_delete_board(auth_client, board_url):
    other = auth_client.post("/api/boards", json={"name": "Other"}).json()
    assert auth_client.delete(board_url).status_code == 204
    assert [b["id"] for b in auth_client.get("/api/boards").json()] == [other["id"]]
    assert auth_client.get(board_url).status_code == 404
    assert auth_client.delete(board_url).status_code == 404


def test_the_last_board_can_be_deleted(auth_client, board_url):
    assert auth_client.delete(board_url).status_code == 204
    assert auth_client.get("/api/boards").json() == []


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_unknown_board_is_404(auth_client, method):
    kwargs = {"json": {"name": "X"}} if method == "patch" else {}
    assert getattr(auth_client, method)("/api/boards/999", **kwargs).status_code == 404
    assert auth_client.get("/api/boards/not-a-number").status_code == 422


def test_boards_are_independent(auth_client, board_url):
    second = f"/api/boards/{auth_client.post('/api/boards', json={'name': 'B'}).json()['id']}"
    auth_client.post(f"{second}/cards", json={"column_id": "col-done", "title": "Only here"})
    auth_client.patch(f"{second}/columns/col-done", json={"title": "Shipped"})
    auth_client.delete(f"{board_url}/cards/card-1")

    first_board, second_board = auth_client.get(board_url).json(), auth_client.get(second).json()
    assert len(first_board["cards"]) == 7 and first_board["columns"][-1]["title"] == "Done"
    assert [c["title"] for c in second_board["cards"].values()] == ["Only here"]
    assert second_board["columns"][-1]["title"] == "Shipped"
    counts = {b["name"]: b["card_count"] for b in auth_client.get("/api/boards").json()}
    assert counts == {"My board": 7, "B": 1}


def test_card_ids_from_one_board_do_not_work_on_another(auth_client, board_url):
    second = f"/api/boards/{auth_client.post('/api/boards', json={'name': 'B'}).json()['id']}"
    assert auth_client.patch(f"{second}/cards/card-1", json={"title": "X"}).status_code == 404
    assert auth_client.post(f"{second}/cards/card-1/move", json={"column_id": "col-done"}).status_code == 404


def test_updated_at_changes_when_the_board_changes(auth_client, board_url):
    before = auth_client.get("/api/boards").json()[0]["updated_at"]
    auth_client.patch(f"{board_url}/columns/col-done", json={"title": "Shipped"})
    assert auth_client.get("/api/boards").json()[0]["updated_at"] > before


def test_boards_persist_across_restart(auth_client, make_client):
    auth_client.post("/api/boards", json={"name": "Kept"})
    restarted = make_client()
    restarted.post("/api/login", json={"username": "user", "password": "password"})
    assert [b["name"] for b in restarted.get("/api/boards").json()] == ["My board", "Kept"]
