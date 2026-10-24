import threading
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request

from app import db
from app.models.board import Board
from app.services.board_ops import NotFoundError


def current_user(request: Request) -> db.User:
    user_id = request.session.get("user_id")
    user = db.get_user_by_id(request.app.state.db_path, user_id) if user_id else None
    if user is None:  # never signed in, or the account was deleted
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


CurrentUser = Annotated[db.User, Depends(current_user)]

# Handlers run in a thread pool; without this, two requests could load the same board
# and the second save would discard the first.
_write_lock = threading.Lock()


class UserBoard:
    """One of the signed-in user's boards (from the `board_id` path parameter)."""

    def __init__(self, request: Request, board_id: int, user: CurrentUser):
        self.db_path = request.app.state.db_path
        self.user_id = user.id
        self.board_id = board_id

    def load(self) -> Board:
        board = db.get_board(self.db_path, self.user_id, self.board_id)
        if board is None:  # missing, or another user's board
            raise NotFoundError(f"board {self.board_id} not found")
        return board

    def update(self, change: Callable[[Board], Board]) -> Board:
        """Load, change, validate and save the board as one step."""
        with _write_lock:
            board = Board.model_validate(change(self.load()).model_dump())
            db.save_board(self.db_path, self.user_id, self.board_id, board)
            return board
