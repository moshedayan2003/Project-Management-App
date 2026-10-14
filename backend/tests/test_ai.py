import os

import pytest

from app.services.ai import ask


@pytest.mark.live
@pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="no OPENROUTER_API_KEY")
def test_live_answer():
    assert "4" in ask("What is 2+2? Answer with just the number.")


@pytest.mark.live
@pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="no OPENROUTER_API_KEY")
def test_live_chat_create_card():
    from app.models.board import default_board
    from app.services.ai import chat

    reply = chat(default_board(), [], "Add a card called Write docs to the Backlog column.")
    assert any(
        op.type == "create_card" and op.column_id == "col-backlog" and "docs" in op.title.lower()
        for op in reply.operations
    )


@pytest.mark.live
@pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="no OPENROUTER_API_KEY")
def test_live_chat_move_card():
    from app.models.board import default_board
    from app.services.ai import chat

    reply = chat(default_board(), [], "Move card-1 to the Done column.")
    assert any(
        op.type == "move_card" and op.card_id == "card-1" and op.column_id == "col-done"
        for op in reply.operations
    )


@pytest.mark.live
@pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="no OPENROUTER_API_KEY")
def test_live_chat_question_changes_nothing():
    from app.models.board import default_board
    from app.services.ai import chat

    reply = chat(default_board(), [], "How many cards are on the board? Do not change anything.")
    assert reply.operations == []
    assert "8" in reply.message


@pytest.mark.live
@pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="no OPENROUTER_API_KEY")
def test_live_chat_route_changes_stored_board(auth_client):
    response = auth_client.post(
        "/api/chat", json={"message": "Delete card-8 and rename the Review column to QA."}
    )
    assert response.status_code == 200
    stored = auth_client.get("/api/board").json()
    assert stored == response.json()["board"]
    assert "card-8" not in stored["cards"]
    assert next(c for c in stored["columns"] if c["id"] == "col-review")["title"] == "QA"
