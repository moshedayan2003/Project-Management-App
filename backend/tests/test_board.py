import pytest
from pydantic import ValidationError

from app.models.board import COLUMN_IDS, Board, default_board
from app.services import board_ops as ops
from app.services.board_ops import NotFoundError


def ids(board, column_id):
    return next(c.cardIds for c in board.columns if c.id == column_id)


def test_default_board_is_valid_and_matches_the_demo():
    board = default_board()
    assert [c.id for c in board.columns] == COLUMN_IDS
    assert len(board.cards) == 8
    assert ids(board, "col-progress") == ["card-4", "card-5"]


def test_create_card_appends_to_column():
    board = ops.create_card(default_board(), "col-review", "New", "Details")
    new_id = ids(board, "col-review")[-1]
    assert board.cards[new_id].title == "New"
    assert board.cards[new_id].details == "Details"
    Board.model_validate(board.model_dump())


def test_create_card_ids_are_unique():
    board = default_board()
    ops.create_card(board, "col-done", "A")
    ops.create_card(board, "col-done", "B")
    assert len(set(ids(board, "col-done"))) == 4


def test_create_card_unknown_column():
    with pytest.raises(NotFoundError):
        ops.create_card(default_board(), "col-nope", "X")


def test_update_card_changes_only_given_fields():
    board = ops.update_card(default_board(), "card-1", title="Changed")
    assert board.cards["card-1"].title == "Changed"
    assert board.cards["card-1"].details.startswith("Draft quarterly")
    board = ops.update_card(board, "card-1", details="Only details")
    assert board.cards["card-1"].title == "Changed"
    assert board.cards["card-1"].details == "Only details"


def test_update_unknown_card():
    with pytest.raises(NotFoundError):
        ops.update_card(default_board(), "card-99", title="X")


def test_move_card_to_other_column_at_position():
    board = ops.move_card(default_board(), "card-1", "col-progress", 1)
    assert ids(board, "col-backlog") == ["card-2"]
    assert ids(board, "col-progress") == ["card-4", "card-1", "card-5"]


def test_move_card_defaults_to_end_and_clamps_position():
    board = ops.move_card(default_board(), "card-1", "col-done")
    assert ids(board, "col-done")[-1] == "card-1"
    board = ops.move_card(default_board(), "card-1", "col-review", 99)
    assert ids(board, "col-review") == ["card-6", "card-1"]


def test_move_card_clamps_negative_position():
    # Regression: the AI can send position -1, which list.insert put second from the end.
    board = ops.move_card(default_board(), "card-1", "col-done", -1)
    assert ids(board, "col-done") == ["card-1", "card-7", "card-8"]


def test_move_card_within_column():
    board = ops.move_card(default_board(), "card-1", "col-backlog", 1)
    assert ids(board, "col-backlog") == ["card-2", "card-1"]


def test_move_unknown_card_or_column():
    with pytest.raises(NotFoundError):
        ops.move_card(default_board(), "card-99", "col-done")
    with pytest.raises(NotFoundError):
        ops.move_card(default_board(), "card-1", "col-nope")


def test_move_to_unknown_column_does_not_lose_the_card():
    board = default_board()
    with pytest.raises(NotFoundError):
        ops.move_card(board, "card-1", "col-nope")
    assert "card-1" in ids(board, "col-backlog")


def test_delete_card():
    board = ops.delete_card(default_board(), "card-1")
    assert "card-1" not in board.cards
    assert ids(board, "col-backlog") == ["card-2"]
    Board.model_validate(board.model_dump())


def test_delete_unknown_card():
    with pytest.raises(NotFoundError):
        ops.delete_card(default_board(), "card-99")


def test_rename_column():
    board = ops.rename_column(default_board(), "col-backlog", "Ideas")
    assert board.columns[0].title == "Ideas"
    with pytest.raises(NotFoundError):
        ops.rename_column(board, "col-nope", "X")


def board_dict():
    return default_board().model_dump()


def test_validation_rejects_wrong_columns():
    data = board_dict()
    data["columns"] = data["columns"][:4]
    with pytest.raises(ValidationError):
        Board.model_validate(data)
    data = board_dict()
    data["columns"].reverse()
    with pytest.raises(ValidationError):
        Board.model_validate(data)


def test_validation_rejects_card_in_two_columns():
    data = board_dict()
    data["columns"][1]["cardIds"].append("card-1")
    with pytest.raises(ValidationError):
        Board.model_validate(data)


def test_validation_rejects_dangling_and_orphan_cards():
    data = board_dict()
    data["columns"][0]["cardIds"].append("card-99")
    with pytest.raises(ValidationError):
        Board.model_validate(data)
    data = board_dict()
    data["columns"][0]["cardIds"].remove("card-1")
    with pytest.raises(ValidationError):
        Board.model_validate(data)


def test_validation_rejects_key_id_mismatch_and_blank_titles():
    data = board_dict()
    data["cards"]["card-1"]["id"] = "card-other"
    with pytest.raises(ValidationError):
        Board.model_validate(data)
    data = board_dict()
    data["cards"]["card-1"]["title"] = "   "
    with pytest.raises(ValidationError):
        Board.model_validate(data)
    data = board_dict()
    data["columns"][0]["title"] = ""
    with pytest.raises(ValidationError):
        Board.model_validate(data)
