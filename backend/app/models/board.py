from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints, model_validator

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=24)]
Priority = Literal["low", "medium", "high"]

COLUMN_IDS = ["col-backlog", "col-discovery", "col-progress", "col-review", "col-done"]
COLUMN_TITLES = ["Backlog", "Discovery", "In Progress", "Review", "Done"]


class Card(BaseModel):
    id: str
    title: Title
    details: str = ""
    priority: Priority | None = None
    due_date: date | None = None
    labels: list[Label] = []


class Column(BaseModel):
    id: str
    title: Title
    cardIds: list[str]


class Board(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]

    @model_validator(mode="after")
    def check_consistency(self):
        if [column.id for column in self.columns] != COLUMN_IDS:
            raise ValueError(f"columns must be exactly {COLUMN_IDS}")
        for key, card in self.cards.items():
            if key != card.id:
                raise ValueError(f"card key {key} does not match card id {card.id}")
        placed = [card_id for column in self.columns for card_id in column.cardIds]
        if len(placed) != len(set(placed)):
            raise ValueError("a card appears in more than one place")
        if set(placed) != set(self.cards):
            raise ValueError("cardIds and cards do not match")
        return self


def empty_board() -> Board:
    return Board(
        columns=[
            Column(id=column_id, title=title, cardIds=[])
            for column_id, title in zip(COLUMN_IDS, COLUMN_TITLES)
        ],
        cards={},
    )


def default_board() -> Board:
    cards = [
        ("card-1", "Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
        ("card-2", "Gather customer signals", "Review support tags, sales notes, and churn feedback."),
        ("card-3", "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
        ("card-4", "Refine status language", "Standardize column labels and tone across the board."),
        ("card-5", "Design card layout", "Add hierarchy and spacing for scanning dense lists."),
        ("card-6", "QA micro-interactions", "Verify hover, focus, and loading states."),
        ("card-7", "Ship marketing page", "Final copy approved and asset pack delivered."),
        ("card-8", "Close onboarding sprint", "Document release notes and share internally."),
    ]
    layout = [[1, 2], [3], [4, 5], [6], [7, 8]]
    board = empty_board()
    for column, numbers in zip(board.columns, layout):
        column.cardIds = [f"card-{n}" for n in numbers]
    board.cards = {id: Card(id=id, title=title, details=details) for id, title, details in cards}
    return board
