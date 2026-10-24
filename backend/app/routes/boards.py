from typing import Annotated

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, StringConstraints

from app import db
from app.deps import CurrentUser
from app.models.board import empty_board
from app.services.board_ops import NotFoundError

router = APIRouter(prefix="/api/boards")

BoardName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class BoardInfo(BaseModel):
    name: BoardName


def _summary(request: Request, user: db.User, board_id: int) -> dict:
    summary = db.get_board_summary(request.app.state.db_path, user.id, board_id)
    if summary is None:
        raise NotFoundError(f"board {board_id} not found")
    return summary


@router.get("")
def list_boards(request: Request, user: CurrentUser) -> list[dict]:
    """Name, dates and card count of each of the user's boards, oldest first."""
    return db.list_boards(request.app.state.db_path, user.id)


@router.post("", status_code=201)
def create_board(body: BoardInfo, request: Request, user: CurrentUser) -> dict:
    board_id = db.create_board(request.app.state.db_path, user.id, body.name, empty_board())
    return _summary(request, user, board_id)


@router.patch("/{board_id}")
def rename_board(board_id: int, body: BoardInfo, request: Request, user: CurrentUser) -> dict:
    db.rename_board(request.app.state.db_path, user.id, board_id, body.name)
    return _summary(request, user, board_id)


@router.delete("/{board_id}", status_code=204)
def delete_board(board_id: int, request: Request, user: CurrentUser):
    if not db.delete_board(request.app.state.db_path, user.id, board_id):
        raise NotFoundError(f"board {board_id} not found")
    return Response(status_code=204)
