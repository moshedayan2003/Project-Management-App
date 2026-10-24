import threading
import time

import pytest

from app import db
from app.models.board import default_board


def column_ids(board, column_id):
    return next(c["cardIds"] for c in board["columns"] if c["id"] == column_id)


# --- authentication


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("get", "/api/boards", None),
        ("post", "/api/boards", {"name": "X"}),
        ("patch", "/api/boards/1", {"name": "X"}),
        ("delete", "/api/boards/1", None),
        ("get", "/api/boards/1", None),
        ("put", "/api/boards/1", default_board().model_dump(mode="json")),
        ("post", "/api/boards/1/cards", {"column_id": "col-backlog", "title": "X"}),
        ("patch", "/api/boards/1/cards/card-1", {"title": "X"}),
        ("post", "/api/boards/1/cards/card-1/move", {"column_id": "col-done"}),
        ("delete", "/api/boards/1/cards/card-1", None),
        ("patch", "/api/boards/1/columns/col-backlog", {"title": "X"}),
        ("post", "/api/boards/1/chat", {"message": "hi"}),
    ],
)
def test_board_routes_require_login(client, method, path, body):
    response = getattr(client, method)(path, json=body) if body else getattr(client, method)(path)
    assert response.status_code == 401


# --- reading and replacing


def test_get_board_returns_the_default_board(auth_client, board_url):
    response = auth_client.get(board_url)
    assert response.status_code == 200
    assert response.json() == default_board().model_dump(mode="json")


def test_put_board_replaces_it(auth_client, board_url):
    data = default_board().model_dump(mode="json")
    data["columns"][0]["title"] = "Ideas"
    response = auth_client.put(board_url, json=data)
    assert response.status_code == 200
    assert auth_client.get(board_url).json()["columns"][0]["title"] == "Ideas"


def test_put_invalid_board_is_rejected_and_not_stored(auth_client, board_url):
    data = default_board().model_dump(mode="json")
    data["columns"][0]["cardIds"].append("card-99")
    assert auth_client.put(board_url, json=data).status_code == 422
    assert auth_client.get(board_url).json() == default_board().model_dump(mode="json")


# --- cards


def test_create_card(auth_client, board_url):
    response = auth_client.post(
        f"{board_url}/cards", json={"column_id": "col-review", "title": "  Fresh  ", "details": "Notes"}
    )
    assert response.status_code == 201
    board = response.json()
    new_id = column_ids(board, "col-review")[-1]
    assert board["cards"][new_id] == {
        "id": new_id, "title": "Fresh", "details": "Notes", "priority": None, "due_date": None, "labels": []
    }


def test_create_card_with_priority_due_date_and_labels(auth_client, board_url):
    body = {"column_id": "col-backlog", "title": "Plan", "priority": "high",
            "due_date": "2026-11-01", "labels": [" ux ", "api"]}
    board = auth_client.post(f"{board_url}/cards", json=body).json()
    card = board["cards"][column_ids(board, "col-backlog")[-1]]
    assert (card["priority"], card["due_date"], card["labels"]) == ("high", "2026-11-01", ["ux", "api"])


@pytest.mark.parametrize("field,value", [
    ("priority", "urgent"), ("due_date", "next week"), ("due_date", "2026-02-30"),
    ("labels", [""]), ("labels", ["x" * 25]),
])
def test_invalid_card_fields_are_422(auth_client, board_url, field, value):
    body = {"column_id": "col-backlog", "title": "X", field: value}
    assert auth_client.post(f"{board_url}/cards", json=body).status_code == 422
    assert auth_client.patch(f"{board_url}/cards/card-1", json={field: value}).status_code == 422


def test_update_card_sets_and_clears_fields(auth_client, board_url):
    url = f"{board_url}/cards/card-1"
    card = auth_client.patch(url, json={"priority": "low", "due_date": "2026-12-24", "labels": ["q4"]}).json()["cards"]["card-1"]
    assert (card["priority"], card["due_date"], card["labels"]) == ("low", "2026-12-24", ["q4"])
    assert card["title"] == "Align roadmap themes"

    card = auth_client.patch(url, json={"priority": None, "due_date": None, "labels": []}).json()["cards"]["card-1"]
    assert (card["priority"], card["due_date"], card["labels"]) == (None, None, [])


def test_null_title_is_422_and_changes_nothing(auth_client, board_url):
    # Regression: an explicit null title reached the Card model and raised a 500.
    assert auth_client.patch(f"{board_url}/cards/card-1", json={"title": None}).status_code == 422
    assert auth_client.get(board_url).json()["cards"]["card-1"]["title"] == "Align roadmap themes"


def test_create_card_validation(auth_client, board_url):
    assert auth_client.post(f"{board_url}/cards", json={"column_id": "col-review", "title": "  "}).status_code == 422
    assert auth_client.post(f"{board_url}/cards", json={"title": "X"}).status_code == 422
    assert auth_client.post(f"{board_url}/cards", json={"column_id": "col-nope", "title": "X"}).status_code == 404


def test_update_card(auth_client, board_url):
    response = auth_client.patch(f"{board_url}/cards/card-1", json={"title": "Changed"})
    assert response.status_code == 200
    card = response.json()["cards"]["card-1"]
    assert card["title"] == "Changed"
    assert card["details"].startswith("Draft quarterly")


def test_update_card_errors(auth_client, board_url):
    assert auth_client.patch(f"{board_url}/cards/card-99", json={"title": "X"}).status_code == 404
    assert auth_client.patch(f"{board_url}/cards/card-1", json={"title": ""}).status_code == 422


def test_move_card(auth_client, board_url):
    response = auth_client.post(
        f"{board_url}/cards/card-1/move", json={"column_id": "col-progress", "position": 0}
    )
    assert response.status_code == 200
    board = response.json()
    assert column_ids(board, "col-progress") == ["card-1", "card-4", "card-5"]
    assert column_ids(board, "col-backlog") == ["card-2"]


def test_move_card_errors(auth_client, board_url):
    assert auth_client.post(f"{board_url}/cards/card-99/move", json={"column_id": "col-done"}).status_code == 404
    assert auth_client.post(f"{board_url}/cards/card-1/move", json={"column_id": "col-nope"}).status_code == 404
    assert (
        auth_client.post(f"{board_url}/cards/card-1/move", json={"column_id": "col-done", "position": -1}).status_code
        == 422
    )


def test_overlapping_moves_are_both_saved(auth_client, board_url, monkeypatch):
    # Regression: both requests loaded the same board and the second save discarded the first.
    real_get_board = db.get_board

    def slow_get_board(*args):
        board = real_get_board(*args)
        time.sleep(0.2)
        return board

    monkeypatch.setattr(db, "get_board", slow_get_board)

    def move(card_id):
        response = auth_client.post(f"{board_url}/cards/{card_id}/move", json={"column_id": "col-done"})
        assert response.status_code == 200

    threads = [threading.Thread(target=move, args=(card_id,)) for card_id in ("card-1", "card-3")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    done = column_ids(auth_client.get(board_url).json(), "col-done")
    assert "card-1" in done and "card-3" in done


def test_delete_card(auth_client, board_url):
    response = auth_client.delete(f"{board_url}/cards/card-1")
    assert response.status_code == 200
    assert "card-1" not in response.json()["cards"]
    assert auth_client.delete(f"{board_url}/cards/card-1").status_code == 404


# --- columns


def test_rename_column(auth_client, board_url):
    response = auth_client.patch(f"{board_url}/columns/col-done", json={"title": "Shipped"})
    assert response.status_code == 200
    assert response.json()["columns"][-1]["title"] == "Shipped"


def test_rename_column_errors(auth_client, board_url):
    assert auth_client.patch(f"{board_url}/columns/col-nope", json={"title": "X"}).status_code == 404
    assert auth_client.patch(f"{board_url}/columns/col-done", json={"title": " "}).status_code == 422


# --- integration: flows against a real SQLite file


def test_changes_persist_across_logout_login_and_app_restart(auth_client, board_url, make_client):
    auth_client.post(f"{board_url}/cards", json={"column_id": "col-backlog", "title": "Persistent"})
    auth_client.patch(f"{board_url}/columns/col-done", json={"title": "Shipped"})
    auth_client.post(f"{board_url}/cards/card-1/move", json={"column_id": "col-done"})
    expected = auth_client.get(board_url).json()

    auth_client.post("/api/logout")
    assert auth_client.get(board_url).status_code == 401
    auth_client.post("/api/login", json={"username": "user", "password": "password"})
    assert auth_client.get(board_url).json() == expected

    restarted = make_client()  # new app on the same database file
    restarted.post("/api/login", json={"username": "user", "password": "password"})
    assert restarted.get(board_url).json() == expected


def test_database_is_recreated_when_the_file_is_deleted(auth_client, board_url, make_client, db_path):
    auth_client.delete(f"{board_url}/cards/card-1")
    db_path.unlink()

    fresh = make_client()
    fresh.post("/api/login", json={"username": "user", "password": "password"})
    assert fresh.get(board_url).json() == default_board().model_dump(mode="json")


def test_sequence_of_mutations_keeps_the_board_valid(auth_client, board_url):
    created = auth_client.post(f"{board_url}/cards", json={"column_id": "col-discovery", "title": "A"}).json()
    new_id = column_ids(created, "col-discovery")[-1]
    auth_client.post(f"{board_url}/cards/{new_id}/move", json={"column_id": "col-review", "position": 0})
    auth_client.patch(f"{board_url}/cards/{new_id}", json={"details": "More"})
    auth_client.delete(f"{board_url}/cards/card-3")
    board = auth_client.get(board_url).json()

    assert column_ids(board, "col-review")[0] == new_id
    assert board["cards"][new_id]["details"] == "More"
    assert "card-3" not in board["cards"]
    assert auth_client.put(board_url, json=board).status_code == 200
