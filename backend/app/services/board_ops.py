import uuid

from app.models.board import Board, Card, Column


class NotFoundError(Exception):
    pass


def _column(board: Board, column_id: str) -> Column:
    for column in board.columns:
        if column.id == column_id:
            return column
    raise NotFoundError(f"column {column_id} not found")


def _column_of(board: Board, card_id: str) -> Column:
    for column in board.columns:
        if card_id in column.cardIds:
            return column
    raise NotFoundError(f"card {card_id} not found")


# Board operations. Each mutates and returns the board; callers validate and save it.


def create_card(board: Board, column_id: str, title: str, **fields) -> Board:
    """`fields` are optional card fields: details, priority, due_date, labels."""
    column = _column(board, column_id)
    card = Card(id=f"card-{uuid.uuid4().hex[:8]}", title=title, **fields)
    board.cards[card.id] = card
    column.cardIds.append(card.id)
    return board


def update_card(board: Board, card_id: str, **changes) -> Board:
    """Replace only the given card fields; validation happens when the board is checked."""
    _column_of(board, card_id)
    board.cards[card_id] = Card(**{**board.cards[card_id].model_dump(), **changes, "id": card_id})
    return board


def move_card(
    board: Board, card_id: str, column_id: str, position: int | None = None
) -> Board:
    source = _column_of(board, card_id)
    target = _column(board, column_id)
    source.cardIds.remove(card_id)
    if position is None or position > len(target.cardIds):
        position = len(target.cardIds)
    target.cardIds.insert(max(position, 0), card_id)
    return board


def delete_card(board: Board, card_id: str) -> Board:
    _column_of(board, card_id).cardIds.remove(card_id)
    del board.cards[card_id]
    return board


def rename_column(board: Board, column_id: str, title: str) -> Board:
    _column(board, column_id).title = title
    return board
