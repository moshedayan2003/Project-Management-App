from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app import board as ops
from app import db
from app.auth import current_user
from app.board import Board, Title

router = APIRouter(prefix="/api")


class NewCard(BaseModel):
    column_id: str
    title: Title
    details: str = ""


class CardUpdate(BaseModel):
    title: Title | None = None
    details: str | None = None


class CardMove(BaseModel):
    column_id: str
    position: int | None = Field(default=None, ge=0)


class ColumnRename(BaseModel):
    title: Title


class UserBoard:
    """Loads the signed-in user's board and saves it back after an operation."""

    def __init__(self, request: Request, username: Annotated[str, Depends(current_user)]):
        self.db_path = request.app.state.db_path
        self.user_id = db.get_user_id(self.db_path, username)

    def load(self) -> Board:
        return db.get_board(self.db_path, self.user_id)

    def save(self, board: Board) -> Board:
        board = Board.model_validate(board.model_dump())
        db.save_board(self.db_path, self.user_id, board)
        return board


@router.get("/board")
def get_board(user_board: Annotated[UserBoard, Depends()]) -> Board:
    return user_board.load()


@router.put("/board")
def replace_board(board: Board, user_board: Annotated[UserBoard, Depends()]) -> Board:
    return user_board.save(board)


@router.post("/cards", status_code=201)
def create_card(body: NewCard, user_board: Annotated[UserBoard, Depends()]) -> Board:
    board = ops.create_card(user_board.load(), body.column_id, body.title, body.details)
    return user_board.save(board)


@router.patch("/cards/{card_id}")
def update_card(
    card_id: str, body: CardUpdate, user_board: Annotated[UserBoard, Depends()]
) -> Board:
    board = ops.update_card(user_board.load(), card_id, body.title, body.details)
    return user_board.save(board)


@router.post("/cards/{card_id}/move")
def move_card(
    card_id: str, body: CardMove, user_board: Annotated[UserBoard, Depends()]
) -> Board:
    board = ops.move_card(user_board.load(), card_id, body.column_id, body.position)
    return user_board.save(board)


@router.delete("/cards/{card_id}")
def delete_card(card_id: str, user_board: Annotated[UserBoard, Depends()]) -> Board:
    return user_board.save(ops.delete_card(user_board.load(), card_id))


@router.patch("/columns/{column_id}")
def rename_column(
    column_id: str, body: ColumnRename, user_board: Annotated[UserBoard, Depends()]
) -> Board:
    board = ops.rename_column(user_board.load(), column_id, body.title)
    return user_board.save(board)
