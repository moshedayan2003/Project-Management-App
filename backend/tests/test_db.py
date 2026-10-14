import sqlite3
from contextlib import closing

from app import db
from app.models.board import default_board
from app.services import board_ops as ops


def test_creates_missing_file_with_user_and_default_board(tmp_path):
    path = tmp_path / "nested" / "pm.db"
    assert not path.exists()
    db.init_db(path)
    assert path.exists()
    user_id = db.get_user_id(path, "user")
    assert user_id is not None
    assert db.get_board(path, user_id) == default_board()


def test_init_is_idempotent_and_keeps_existing_data(tmp_path):
    path = tmp_path / "pm.db"
    db.init_db(path)
    user_id = db.get_user_id(path, "user")
    db.save_board(path, user_id, ops.rename_column(db.get_board(path, user_id), "col-done", "Shipped"))

    db.init_db(path)  # simulates a restart
    assert db.get_user_id(path, "user") == user_id
    assert db.get_board(path, user_id).columns[-1].title == "Shipped"


def test_unknown_user(tmp_path):
    db.init_db(tmp_path / "pm.db")
    assert db.get_user_id(tmp_path / "pm.db", "nobody") is None


def test_users_have_separate_boards(tmp_path):
    path = tmp_path / "pm.db"
    db.init_db(path)
    with closing(sqlite3.connect(path)) as conn, conn:
        cursor = conn.execute("INSERT INTO users (username) VALUES ('other')")
        other_id = cursor.lastrowid
        conn.execute(
            "INSERT INTO boards (user_id, data, updated_at) VALUES (?, ?, 'now')",
            (other_id, default_board().model_dump_json()),
        )
    user_id = db.get_user_id(path, "user")

    db.save_board(path, user_id, ops.delete_card(db.get_board(path, user_id), "card-1"))

    assert "card-1" not in db.get_board(path, user_id).cards
    assert "card-1" in db.get_board(path, other_id).cards


def test_one_board_per_user(tmp_path):
    path = tmp_path / "pm.db"
    db.init_db(path)
    user_id = db.get_user_id(path, "user")
    with closing(sqlite3.connect(path)) as conn, conn:
        try:
            conn.execute(
                "INSERT INTO boards (user_id, data, updated_at) VALUES (?, '{}', 'now')",
                (user_id,),
            )
            raised = False
        except sqlite3.IntegrityError:
            raised = True
    assert raised
