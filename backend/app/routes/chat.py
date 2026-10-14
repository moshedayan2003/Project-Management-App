from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError

from app.deps import UserBoard
from app.models.board import Board
from app.services import ai
from app.services import board_ops as ops
from app.services.board_ops import NotFoundError

router = APIRouter(prefix="/api")


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
    try:
        reply = ai.chat(user_board.load(), body.history, body.message)
    except ai.AIError as error:
        raise HTTPException(status_code=502, detail=str(error))
    applied, skipped = [], []

    # Apply to the board as it is now, not as it was before the (slow) AI call,
    # so changes the user made meanwhile are kept.
    def apply_all(board: Board) -> Board:
        for op in reply.operations:
            # Work on a copy so an invalid operation never leaves the board half changed.
            candidate = board.model_copy(deep=True)
            try:
                apply_operation(candidate, op)
                board = Board.model_validate(candidate.model_dump())
                applied.append(op)
            except (NotFoundError, ValidationError) as error:
                skipped.append({"operation": op, "error": str(error)})
        return board

    return {
        "message": reply.message,
        "board": user_board.update(apply_all),
        "applied": applied,
        "skipped": skipped,
    }
