import sqlite3
from contextlib import closing

import pytest

from app import db
from app.models.board import default_board, empty_board
from app.services import board_ops as ops
from app.services.passwords import hash_password, verify_password


def demo(path):
    user = db.get_user(path, "user")
    return user, db.list_boards(path, user.id)[0]["id"]


def test_creates_missing_file_with_demo_user_and_board(tmp_path):
    path = tmp_path / "nested" / "pm.db"
    assert not path.exists()
    db.init_db(path)
    assert path.exists()
    user, board_id = demo(path)
    assert verify_password("password", user.password_hash)
    assert db.get_board(path, user.id, board_id) == default_board()
    [summary] = db.list_boards(path, user.id)
    assert summary["name"] == "My board" and summary["card_count"] == 8


def test_init_is_idempotent_and_keeps_existing_data(tmp_path):
    path = tmp_path / "pm.db"
    db.init_db(path)
    user, board_id = demo(path)
    board = ops.rename_column(db.get_board(path, user.id, board_id), "col-done", "Shipped")
    db.save_board(path, user.id, board_id, board)

    db.init_db(path)  # simulates a restart
    assert demo(path) == (user, board_id)
    assert db.get_board(path, user.id, board_id).columns[-1].title == "Shipped"


def test_unknown_user(tmp_path):
    db.init_db(tmp_path / "pm.db")
    assert db.get_user(tmp_path / "pm.db", "nobody") is None
    assert db.get_user_by_id(tmp_path / "pm.db", 999) is None


def test_usernames_are_unique(tmp_path):
    path = tmp_path / "pm.db"
    db.init_db(path)
    assert db.create_user(path, "ann", "h") is not None
    assert db.create_user(path, "ann", "h") is None
    assert db.create_user(path, "user", "h") is None


def test_a_user_can_have_several_boards(tmp_path):
    path = tmp_path / "pm.db"
    db.init_db(path)
    user, first = demo(path)
    second = db.create_board(path, user.id, "Second", empty_board())
    assert [b["name"] for b in db.list_boards(path, user.id)] == ["My board", "Second"]
    assert db.get_board(path, user.id, second) == empty_board()
    assert db.list_boards(path, user.id)[1]["card_count"] == 0

    assert db.rename_board(path, user.id, second, "Renamed")
    assert db.get_board_summary(path, user.id, second)["name"] == "Renamed"
    assert db.delete_board(path, user.id, second)
    assert db.get_board(path, user.id, second) is None
    assert not db.delete_board(path, user.id, second)
    assert db.get_board(path, user.id, first) == default_board()


def test_boards_are_scoped_to_their_owner(tmp_path):
    path = tmp_path / "pm.db"
    db.init_db(path)
    user, board_id = demo(path)
    other = db.create_user(path, "other", "h")

    assert db.get_board(path, other.id, board_id) is None
    assert db.get_board_summary(path, other.id, board_id) is None
    assert not db.rename_board(path, other.id, board_id, "Mine now")
    assert not db.delete_board(path, other.id, board_id)
    db.save_board(path, other.id, board_id, empty_board())  # matches no row
    assert db.get_board(path, user.id, board_id) == default_board()
    assert db.list_boards(path, other.id) == []


def test_deleting_a_user_deletes_their_boards(tmp_path):
    path = tmp_path / "pm.db"
    db.init_db(path)
    other = db.create_user(path, "other", "h")
    board_id = db.create_board(path, other.id, "B", empty_board())
    db.delete_user(path, other.id)
    assert db.get_user_by_id(path, other.id) is None
    with closing(sqlite3.connect(path)) as conn:
        assert conn.execute("SELECT count(*) FROM boards WHERE id = ?", (board_id,)).fetchone()[0] == 0


def test_set_password(tmp_path):
    path = tmp_path / "pm.db"
    db.init_db(path)
    user, _ = demo(path)
    db.set_password(path, user.id, hash_password("new password"))
    assert verify_password("new password", db.get_user(path, "user").password_hash)


def test_upgrades_a_version_1_database(tmp_path):
    # Version 1: one board per user (UNIQUE user_id, no name) and no stored password.
    path = tmp_path / "pm.db"
    board = ops.rename_column(default_board(), "col-done", "Shipped").model_dump_json()
    with closing(sqlite3.connect(path)) as conn, conn:
        conn.executescript("""
            CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT,
                                username TEXT NOT NULL UNIQUE, password_hash TEXT);
            CREATE TABLE boards (id INTEGER PRIMARY KEY AUTOINCREMENT,
                                 user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                                 data TEXT NOT NULL, updated_at TEXT NOT NULL);
            INSERT INTO users (username) VALUES ('user');
        """)
        conn.execute("INSERT INTO boards (user_id, data, updated_at) VALUES (1, ?, 'then')", (board,))

    db.init_db(path)

    user, board_id = demo(path)
    assert verify_password("password", user.password_hash)
    assert db.get_board(path, user.id, board_id).columns[-1].title == "Shipped"
    [summary] = db.list_boards(path, user.id)
    assert summary["name"] == "My board" and summary["created_at"] == "then"
    db.create_board(path, user.id, "Second", empty_board())  # UNIQUE(user_id) is gone
    assert len(db.list_boards(path, user.id)) == 2


def test_a_failed_upgrade_changes_nothing(tmp_path, monkeypatch):
    # Regression: sqlite3 runs ALTER/CREATE outside a transaction, so a failure part way
    # left the old boards in a renamed table the app never reads.
    path = tmp_path / "pm.db"
    with closing(sqlite3.connect(path)) as conn, conn:
        conn.executescript("""
            CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT,
                                username TEXT NOT NULL UNIQUE, password_hash TEXT);
            CREATE TABLE boards (id INTEGER PRIMARY KEY AUTOINCREMENT,
                                 user_id INTEGER NOT NULL UNIQUE, data TEXT NOT NULL,
                                 updated_at TEXT NOT NULL);
            INSERT INTO users (username) VALUES ('user');
            INSERT INTO boards (user_id, data, updated_at) VALUES (1, '{}', 'then');
        """)
    monkeypatch.setattr(db, "MIGRATE_V1", [*db.MIGRATE_V1, "SELECT no_such_function()"])

    with pytest.raises(sqlite3.OperationalError):
        db.init_db(path)

    with closing(sqlite3.connect(path)) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        assert "boards_v1" not in tables
        assert conn.execute("SELECT user_id, data FROM boards").fetchall() == [(1, "{}")]
