from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError

from app import ai
from app import board as ops
from app import db
from app.auth import current_user
from app.board import Board, NotFoundError, Title

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


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[ai.ChatMessage] = []


def apply_operation(board: Board, op: ai.Operation) -> Board:
    match op:
        case ai.CreateCard():
            return ops.create_card(board, op.column_id, op.title, op.details)
        case ai.UpdateCard():
            return ops.update_card(board, op.card_id, op.title, op.details)
        case ai.MoveCard():
            return ops.move_card(board, op.card_id, op.column_id, op.position)
        case ai.DeleteCard():
            return ops.delete_card(board, op.card_id)
        case ai.RenameColumn():
            return ops.rename_column(board, op.column_id, op.title)


@router.post("/chat")
def chat(body: ChatRequest, user_board: Annotated[UserBoard, Depends()]):
    board = user_board.load()
    try:
        reply = ai.chat(board, body.history, body.message)
    except ai.AIError as error:
        raise HTTPException(status_code=502, detail=str(error))
    applied, skipped = [], []
    for op in reply.operations:
        # Work on a copy so an invalid operation never leaves the board half changed.
        candidate = board.model_copy(deep=True)
        try:
            apply_operation(candidate, op)
            board = Board.model_validate(candidate.model_dump())
            applied.append(op)
        except (NotFoundError, ValidationError) as error:
            skipped.append({"operation": op, "error": str(error)})
    return {
        "message": reply.message,
        "board": user_board.save(board),
        "applied": applied,
        "skipped": skipped,
    }
