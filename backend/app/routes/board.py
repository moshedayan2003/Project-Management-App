from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.deps import UserBoard
from app.models.board import Board, Title
from app.services import board_ops as ops

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


@router.get("/board")
def get_board(user_board: Annotated[UserBoard, Depends()]) -> Board:
    return user_board.load()


@router.put("/board")
def replace_board(board: Board, user_board: Annotated[UserBoard, Depends()]) -> Board:
    return user_board.update(lambda _: board)


@router.post("/cards", status_code=201)
def create_card(body: NewCard, user_board: Annotated[UserBoard, Depends()]) -> Board:
    return user_board.update(
        lambda board: ops.create_card(board, body.column_id, body.title, body.details)
    )


@router.patch("/cards/{card_id}")
def update_card(
    card_id: str, body: CardUpdate, user_board: Annotated[UserBoard, Depends()]
) -> Board:
    return user_board.update(
        lambda board: ops.update_card(board, card_id, body.title, body.details)
    )


@router.post("/cards/{card_id}/move")
def move_card(
    card_id: str, body: CardMove, user_board: Annotated[UserBoard, Depends()]
) -> Board:
    return user_board.update(
        lambda board: ops.move_card(board, card_id, body.column_id, body.position)
    )


@router.delete("/cards/{card_id}")
def delete_card(card_id: str, user_board: Annotated[UserBoard, Depends()]) -> Board:
    return user_board.update(lambda board: ops.delete_card(board, card_id))


@router.patch("/columns/{column_id}")
def rename_column(
    column_id: str, body: ColumnRename, user_board: Annotated[UserBoard, Depends()]
) -> Board:
    return user_board.update(lambda board: ops.rename_column(board, column_id, body.title))
