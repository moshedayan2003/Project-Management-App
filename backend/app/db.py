import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from app.board import Board, default_board

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT
);
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def _connect(db_path: Path):
    """Open a connection, commit on success, and always close it."""
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        with conn:
            yield conn
    finally:
        conn.close()


def init_db(db_path: Path) -> None:
    """Create the database file, tables and the MVP user with a default board if missing."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect(db_path) as conn:
        conn.executescript(SCHEMA)
        conn.execute("INSERT OR IGNORE INTO users (username) VALUES ('user')")
    user_id = get_user_id(db_path, "user")
    with _connect(db_path) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO boards (user_id, data, updated_at) VALUES (?, ?, ?)",
            (user_id, default_board().model_dump_json(), _now()),
        )


def get_user_id(db_path: Path, username: str) -> int | None:
    with _connect(db_path) as conn:
        row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    return row[0] if row else None


def get_board(db_path: Path, user_id: int) -> Board:
    with _connect(db_path) as conn:
        row = conn.execute("SELECT data FROM boards WHERE user_id = ?", (user_id,)).fetchone()
    return Board.model_validate_json(row[0])


def save_board(db_path: Path, user_id: int, board: Board) -> None:
    with _connect(db_path) as conn:
        conn.execute(
            "UPDATE boards SET data = ?, updated_at = ? WHERE user_id = ?",
            (board.model_dump_json(), _now(), user_id),
        )
