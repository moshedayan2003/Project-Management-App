import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.models.board import Board, default_board
from app.services.passwords import hash_password

USERS_TABLE = """CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT
)"""
BOARDS_TABLE = """CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)"""

# Version 1 allowed one board per user (UNIQUE user_id, no name). SQLite cannot drop a
# constraint, so the table is rebuilt with every existing board kept as "My board".
MIGRATE_V1 = [
    "ALTER TABLE boards RENAME TO boards_v1",
    BOARDS_TABLE,
    """INSERT INTO boards (id, user_id, name, data, created_at, updated_at)
       SELECT id, user_id, 'My board', data, updated_at, updated_at FROM boards_v1""",
    "DROP TABLE boards_v1",
]

DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
FIRST_BOARD_NAME = "My board"


@dataclass
class User:
    id: int
    username: str
    password_hash: str | None


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
    """Create the file and tables if missing, upgrade an old database, and make sure the
    demo user exists (with a password and one board)."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect(db_path) as conn:
        conn.execute(USERS_TABLE)
        conn.execute(BOARDS_TABLE)
        columns = [row[1] for row in conn.execute("PRAGMA table_info(boards)")]
        if "name" not in columns:
            # sqlite3 does not start a transaction for ALTER or CREATE, so start one:
            # a failure part way must leave the old table as it was.
            conn.execute("BEGIN")
            for statement in MIGRATE_V1:
                conn.execute(statement)
        conn.execute("CREATE INDEX IF NOT EXISTS boards_by_user ON boards(user_id)")
    user = get_user(db_path, DEMO_USERNAME)
    if user and user.password_hash is None:
        # Version 1 stored the demo user without a password (login was hardcoded).
        set_password(db_path, user.id, hash_password(DEMO_PASSWORD))
    if user is None:
        user = create_user(db_path, DEMO_USERNAME, hash_password(DEMO_PASSWORD))
        create_board(db_path, user.id, FIRST_BOARD_NAME, default_board())


# --- users


def _user(row) -> User | None:
    return User(*row) if row else None


def get_user(db_path: Path, username: str) -> User | None:
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
    return _user(row)


def get_user_by_id(db_path: Path, user_id: int) -> User | None:
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    return _user(row)


def create_user(db_path: Path, username: str, password_hash: str) -> User | None:
    """Returns None when the username is taken."""
    try:
        with _connect(db_path) as conn:
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, password_hash),
            )
    except sqlite3.IntegrityError:
        return None
    return User(cursor.lastrowid, username, password_hash)


def set_password(db_path: Path, user_id: int, password_hash: str) -> None:
    with _connect(db_path) as conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))


def delete_user(db_path: Path, user_id: int) -> None:
    """Also deletes the user's boards (ON DELETE CASCADE)."""
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


# --- boards (every query is scoped by user, so a user can never reach another's board)


def list_boards(db_path: Path, user_id: int) -> list[dict]:
    with _connect(db_path) as conn:
        rows = conn.execute(
            """SELECT id, name, created_at, updated_at,
                      (SELECT count(*) FROM json_each(data, '$.cards'))
               FROM boards WHERE user_id = ? ORDER BY id""",
            (user_id,),
        ).fetchall()
    keys = ["id", "name", "created_at", "updated_at", "card_count"]
    return [dict(zip(keys, row)) for row in rows]


def get_board_summary(db_path: Path, user_id: int, board_id: int) -> dict | None:
    return next((b for b in list_boards(db_path, user_id) if b["id"] == board_id), None)


def create_board(db_path: Path, user_id: int, name: str, board: Board) -> int:
    now = _now()
    with _connect(db_path) as conn:
        cursor = conn.execute(
            "INSERT INTO boards (user_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, name, board.model_dump_json(), now, now),
        )
    return cursor.lastrowid


def get_board(db_path: Path, user_id: int, board_id: int) -> Board | None:
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT data FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
        ).fetchone()
    return Board.model_validate_json(row[0]) if row else None


def save_board(db_path: Path, user_id: int, board_id: int, board: Board) -> None:
    with _connect(db_path) as conn:
        conn.execute(
            "UPDATE boards SET data = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (board.model_dump_json(), _now(), board_id, user_id),
        )


def rename_board(db_path: Path, user_id: int, board_id: int, name: str) -> bool:
    with _connect(db_path) as conn:
        cursor = conn.execute(
            "UPDATE boards SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (name, _now(), board_id, user_id),
        )
    return cursor.rowcount == 1


def delete_board(db_path: Path, user_id: int, board_id: int) -> bool:
    with _connect(db_path) as conn:
        cursor = conn.execute(
            "DELETE FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
        )
    return cursor.rowcount == 1
