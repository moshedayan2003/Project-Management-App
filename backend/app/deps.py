import threading
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request

from app import db
from app.models.board import Board


def current_user(request: Request) -> str:
    username = request.session.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="Not signed in")
    return username


# Handlers run in a thread pool; without this, two requests could load the same board
# and the second save would discard the first.
_write_lock = threading.Lock()


class UserBoard:
    """Loads the signed-in user's board and applies changes to it."""

    def __init__(self, request: Request, username: Annotated[str, Depends(current_user)]):
        self.db_path = request.app.state.db_path
        self.user_id = db.get_user_id(self.db_path, username)

    def load(self) -> Board:
        return db.get_board(self.db_path, self.user_id)

    def update(self, change: Callable[[Board], Board]) -> Board:
        """Load, change, validate and save the board as one step."""
        with _write_lock:
            board = Board.model_validate(change(self.load()).model_dump())
            db.save_board(self.db_path, self.user_id, board)
            return board
