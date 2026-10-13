import pytest

from app.board import default_board


def column_ids(board, column_id):
    return next(c["cardIds"] for c in board["columns"] if c["id"] == column_id)


# --- authentication


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("get", "/api/board", None),
        ("put", "/api/board", default_board().model_dump()),
        ("post", "/api/cards", {"column_id": "col-backlog", "title": "X"}),
        ("patch", "/api/cards/card-1", {"title": "X"}),
        ("post", "/api/cards/card-1/move", {"column_id": "col-done"}),
        ("delete", "/api/cards/card-1", None),
        ("patch", "/api/columns/col-backlog", {"title": "X"}),
    ],
)
def test_board_routes_require_login(client, method, path, body):
    response = getattr(client, method)(path, json=body) if body else getattr(client, method)(path)
    assert response.status_code == 401


# --- reading and replacing


def test_get_board_returns_the_default_board(auth_client):
    response = auth_client.get("/api/board")
    assert response.status_code == 200
    assert response.json() == default_board().model_dump()


def test_put_board_replaces_it(auth_client):
    data = default_board().model_dump()
    data["columns"][0]["title"] = "Ideas"
    response = auth_client.put("/api/board", json=data)
    assert response.status_code == 200
    assert auth_client.get("/api/board").json()["columns"][0]["title"] == "Ideas"


def test_put_invalid_board_is_rejected_and_not_stored(auth_client):
    data = default_board().model_dump()
    data["columns"][0]["cardIds"].append("card-99")
    assert auth_client.put("/api/board", json=data).status_code == 422
    assert auth_client.get("/api/board").json() == default_board().model_dump()


# --- cards


def test_create_card(auth_client):
    response = auth_client.post(
        "/api/cards", json={"column_id": "col-review", "title": "  Fresh  ", "details": "Notes"}
    )
    assert response.status_code == 201
    board = response.json()
    new_id = column_ids(board, "col-review")[-1]
    assert board["cards"][new_id] == {"id": new_id, "title": "Fresh", "details": "Notes"}


def test_create_card_validation(auth_client):
    assert auth_client.post("/api/cards", json={"column_id": "col-review", "title": "  "}).status_code == 422
    assert auth_client.post("/api/cards", json={"title": "X"}).status_code == 422
    assert auth_client.post("/api/cards", json={"column_id": "col-nope", "title": "X"}).status_code == 404


def test_update_card(auth_client):
    response = auth_client.patch("/api/cards/card-1", json={"title": "Changed"})
    assert response.status_code == 200
    card = response.json()["cards"]["card-1"]
    assert card["title"] == "Changed"
    assert card["details"].startswith("Draft quarterly")


def test_update_card_errors(auth_client):
    assert auth_client.patch("/api/cards/card-99", json={"title": "X"}).status_code == 404
    assert auth_client.patch("/api/cards/card-1", json={"title": ""}).status_code == 422


def test_move_card(auth_client):
    response = auth_client.post(
        "/api/cards/card-1/move", json={"column_id": "col-progress", "position": 0}
    )
    assert response.status_code == 200
    board = response.json()
    assert column_ids(board, "col-progress") == ["card-1", "card-4", "card-5"]
    assert column_ids(board, "col-backlog") == ["card-2"]


def test_move_card_errors(auth_client):
    assert auth_client.post("/api/cards/card-99/move", json={"column_id": "col-done"}).status_code == 404
    assert auth_client.post("/api/cards/card-1/move", json={"column_id": "col-nope"}).status_code == 404
    assert (
        auth_client.post("/api/cards/card-1/move", json={"column_id": "col-done", "position": -1}).status_code
        == 422
    )


def test_delete_card(auth_client):
    response = auth_client.delete("/api/cards/card-1")
    assert response.status_code == 200
    assert "card-1" not in response.json()["cards"]
    assert auth_client.delete("/api/cards/card-1").status_code == 404


# --- columns


def test_rename_column(auth_client):
    response = auth_client.patch("/api/columns/col-done", json={"title": "Shipped"})
    assert response.status_code == 200
    assert response.json()["columns"][-1]["title"] == "Shipped"


def test_rename_column_errors(auth_client):
    assert auth_client.patch("/api/columns/col-nope", json={"title": "X"}).status_code == 404
    assert auth_client.patch("/api/columns/col-done", json={"title": " "}).status_code == 422


# --- integration: flows against a real SQLite file


def test_changes_persist_across_logout_login_and_app_restart(auth_client, make_client):
    auth_client.post("/api/cards", json={"column_id": "col-backlog", "title": "Persistent"})
    auth_client.patch("/api/columns/col-done", json={"title": "Shipped"})
    auth_client.post("/api/cards/card-1/move", json={"column_id": "col-done"})
    expected = auth_client.get("/api/board").json()

    auth_client.post("/api/logout")
    assert auth_client.get("/api/board").status_code == 401
    auth_client.post("/api/login", json={"username": "user", "password": "password"})
    assert auth_client.get("/api/board").json() == expected

    restarted = make_client()  # new app on the same database file
    restarted.post("/api/login", json={"username": "user", "password": "password"})
    assert restarted.get("/api/board").json() == expected


def test_database_is_recreated_when_the_file_is_deleted(auth_client, make_client, db_path):
    auth_client.delete("/api/cards/card-1")
    db_path.unlink()

    fresh = make_client()
    fresh.post("/api/login", json={"username": "user", "password": "password"})
    assert fresh.get("/api/board").json() == default_board().model_dump()


def test_sequence_of_mutations_keeps_the_board_valid(auth_client):
    created = auth_client.post("/api/cards", json={"column_id": "col-discovery", "title": "A"}).json()
    new_id = column_ids(created, "col-discovery")[-1]
    auth_client.post(f"/api/cards/{new_id}/move", json={"column_id": "col-review", "position": 0})
    auth_client.patch(f"/api/cards/{new_id}", json={"details": "More"})
    auth_client.delete("/api/cards/card-3")
    board = auth_client.get("/api/board").json()

    assert column_ids(board, "col-review")[0] == new_id
    assert board["cards"][new_id]["details"] == "More"
    assert "card-3" not in board["cards"]
    assert auth_client.put("/api/board", json=board).status_code == 200
