from typing import Annotated

from pydantic import BaseModel, StringConstraints, model_validator

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]

COLUMN_IDS = ["col-backlog", "col-discovery", "col-progress", "col-review", "col-done"]


class Card(BaseModel):
    id: str
    title: Title
    details: str = ""


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
    titles = ["Backlog", "Discovery", "In Progress", "Review", "Done"]
    layout = [[1, 2], [3], [4, 5], [6], [7, 8]]
    return Board(
        columns=[
            Column(id=column_id, title=title, cardIds=[f"card-{n}" for n in numbers])
            for column_id, title, numbers in zip(COLUMN_IDS, titles, layout)
        ],
        cards={id: Card(id=id, title=title, details=details) for id, title, details in cards},
    )
