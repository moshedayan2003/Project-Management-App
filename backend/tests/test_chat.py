import json
from types import SimpleNamespace

import pytest
from openai import APIConnectionError

from app.models.board import default_board
from app.services import ai


@pytest.fixture
def llm(monkeypatch):
    """Replace the network call. Set llm.reply to the model's JSON (dict) or raw text; llm.calls records inputs."""
    state = SimpleNamespace(reply={"message": "ok", "operations": []}, calls=[])

    def fake_complete(messages, response_format=None):
        state.calls.append(messages)
        if isinstance(state.reply, Exception):
            raise state.reply
        return state.reply if isinstance(state.reply, str) else json.dumps(state.reply)

    monkeypatch.setattr(ai, "complete", fake_complete)
    return state


def chat(client, board_url, message="hi", history=None):
    return client.post(f"{board_url}/chat", json={"message": message, "history": history or []})


def board_of(client, board_url):
    return client.get(board_url).json()


def column(board, column_id):
    return next(c for c in board["columns"] if c["id"] == column_id)


# --- operations


def test_create_card(auth_client, board_url, llm):
    llm.reply = {"message": "Added.", "operations": [
        {"type": "create_card", "column_id": "col-done", "title": "New", "details": "d"}]}
    data = chat(auth_client, board_url).json()
    assert data["message"] == "Added."
    assert len(data["applied"]) == 1 and data["skipped"] == []
    new_id = column(data["board"], "col-done")["cardIds"][-1]
    assert data["board"]["cards"][new_id]["title"] == "New"
    assert board_of(auth_client, board_url) == data["board"]


def test_update_move_delete_rename(auth_client, board_url, llm):
    llm.reply = {"message": "Done.", "operations": [
        {"type": "update_card", "card_id": "card-1", "title": "Renamed"},
        {"type": "move_card", "card_id": "card-2", "column_id": "col-done", "position": 0},
        {"type": "delete_card", "card_id": "card-3"},
        {"type": "rename_column", "column_id": "col-review", "title": "QA"}]}
    data = chat(auth_client, board_url).json()
    board = data["board"]
    assert len(data["applied"]) == 4 and data["skipped"] == []
    assert board["cards"]["card-1"]["title"] == "Renamed"
    assert board["cards"]["card-1"]["details"] == default_board().cards["card-1"].details
    assert column(board, "col-done")["cardIds"][0] == "card-2"
    assert "card-3" not in board["cards"]
    assert column(board, "col-review")["title"] == "QA"
    assert board_of(auth_client, board_url) == board


def test_operations_apply_in_order(auth_client, board_url, llm):
    llm.reply = {"message": "m", "operations": [
        {"type": "move_card", "card_id": "card-1", "column_id": "col-done"},
        {"type": "delete_card", "card_id": "card-1"}]}
    board = chat(auth_client, board_url).json()["board"]
    assert "card-1" not in board["cards"]
    assert "card-1" not in column(board, "col-done")["cardIds"]


def test_plain_reply_leaves_board_unchanged(auth_client, board_url, llm):
    llm.reply = {"message": "There are 8 cards.", "operations": []}
    data = chat(auth_client, board_url).json()
    assert data["applied"] == [] and data["skipped"] == []
    assert data["board"] == default_board().model_dump(mode="json")


def change_board_while_thinking(monkeypatch, client, board_url, reply):
    """The user moves card-1 to Done while the model is working on its reply."""

    def fake_complete(messages, response_format=None):
        assert client.post(f"{board_url}/cards/card-1/move", json={"column_id": "col-done"}).status_code == 200
        return json.dumps(reply)

    monkeypatch.setattr(ai, "complete", fake_complete)


def test_plain_reply_keeps_changes_made_while_thinking(auth_client, board_url, monkeypatch):
    # Regression: chat saved the board it loaded before the AI call, reverting the move.
    change_board_while_thinking(monkeypatch, auth_client, board_url, {"message": "Hi.", "operations": []})
    data = chat(auth_client, board_url).json()
    assert "card-1" in column(data["board"], "col-done")["cardIds"]
    assert "card-1" in column(board_of(auth_client, board_url), "col-done")["cardIds"]


def test_operations_apply_to_the_latest_board(auth_client, board_url, monkeypatch):
    change_board_while_thinking(monkeypatch, auth_client, board_url, {"message": "Renamed.", "operations": [
        {"type": "rename_column", "column_id": "col-review", "title": "QA"}]})
    board = chat(auth_client, board_url).json()["board"]
    assert "card-1" in column(board, "col-done")["cardIds"]
    assert column(board, "col-review")["title"] == "QA"
    assert board_of(auth_client, board_url) == board


def test_operations_set_priority_due_date_and_labels(auth_client, board_url, llm):
    llm.reply = {"message": "m", "operations": [
        {"type": "create_card", "column_id": "col-backlog", "title": "T", "priority": "high",
         "due_date": "2026-11-01", "labels": ["ux"]},
        {"type": "update_card", "card_id": "card-1", "title": None, "details": None,
         "priority": "low", "due_date": None, "labels": None}]}
    board = chat(auth_client, board_url).json()["board"]
    new = board["cards"][column(board, "col-backlog")["cardIds"][-1]]
    assert (new["priority"], new["due_date"], new["labels"]) == ("high", "2026-11-01", ["ux"])
    card = board["cards"]["card-1"]
    # null means "leave alone" for the model, so only the priority changed
    assert card["priority"] == "low"
    assert card["title"] == "Align roadmap themes" and card["details"].startswith("Draft")


def test_chat_works_on_the_board_in_the_url(auth_client, board_url, llm):
    second = f"/api/boards/{auth_client.post('/api/boards', json={'name': 'B'}).json()['id']}"
    llm.reply = {"message": "m", "operations": [
        {"type": "create_card", "column_id": "col-done", "title": "Second only"}]}
    data = chat(auth_client, second).json()
    assert [c["title"] for c in data["board"]["cards"].values()] == ["Second only"]
    assert '"cards":{}' in llm.calls[0][0]["content"]  # the model saw the second board
    assert board_of(auth_client, board_url) == default_board().model_dump(mode="json")


def test_chat_on_unknown_board_is_404_without_calling_the_model(auth_client, llm):
    assert chat(auth_client, "/api/boards/999").status_code == 404
    assert llm.calls == []


def test_prompt_includes_today(auth_client, board_url, llm):
    from datetime import date

    chat(auth_client, board_url)
    assert f"Today is {date.today()}" in llm.calls[0][0]["content"]


# --- invalid operations are skipped and the board stays consistent


def test_invalid_operations_are_skipped(auth_client, board_url, llm):
    llm.reply = {"message": "m", "operations": [
        {"type": "delete_card", "card_id": "nope"},
        {"type": "move_card", "card_id": "card-1", "column_id": "col-nope"},
        {"type": "create_card", "column_id": "col-nope", "title": "X"},
        {"type": "create_card", "column_id": "col-done", "title": "   "},
        {"type": "rename_column", "column_id": "col-done", "title": ""},
        {"type": "update_card", "card_id": "card-1", "title": " "},
        {"type": "delete_card", "card_id": "card-8"}]}
    data = chat(auth_client, board_url).json()
    assert len(data["skipped"]) == 6
    assert [op["card_id"] for op in data["applied"]] == ["card-8"]
    expected = default_board()
    expected.cards.pop("card-8")
    expected.columns[4].cardIds.remove("card-8")
    assert data["board"] == expected.model_dump()
    assert board_of(auth_client, board_url) == data["board"]


# --- prompt contents and history


def test_board_and_history_are_sent_to_the_model(auth_client, board_url, llm):
    history = [{"role": "user", "content": "first"}, {"role": "assistant", "content": "answer"}]
    chat(auth_client, board_url, "second", history)
    messages = llm.calls[0]
    assert messages[0]["role"] == "system"
    assert default_board().model_dump_json() in messages[0]["content"]
    assert [m["content"] for m in messages[1:]] == ["first", "answer", "second"]
    assert [m["role"] for m in messages[1:]] == ["user", "assistant", "user"]


def test_prompt_uses_the_current_board(auth_client, board_url, llm):
    auth_client.patch(f"{board_url}/columns/col-done", json={"title": "Shipped"})
    chat(auth_client, board_url)
    assert "Shipped" in llm.calls[0][0]["content"]


# --- errors


@pytest.mark.parametrize("raw", ["not json", "{}", '{"message": "m", "operations": [{"type": "explode"}]}', ""])
def test_malformed_model_output_is_a_clean_502(auth_client, board_url, llm, raw):
    llm.reply = raw
    response = chat(auth_client, board_url)
    assert response.status_code == 502
    assert board_of(auth_client, board_url) == default_board().model_dump(mode="json")


def test_llm_failure_is_a_clean_502(auth_client, board_url, llm):
    llm.reply = ai.AIError("AI request failed: timeout")
    response = chat(auth_client, board_url)
    assert response.status_code == 502
    assert "timeout" in response.json()["detail"]


def test_empty_message_is_422(auth_client, board_url, llm):
    assert chat(auth_client, board_url, "").status_code == 422
    assert llm.calls == []


def test_chat_requires_login(client, llm):
    assert chat(client, "/api/boards/1").status_code == 401
    assert llm.calls == []


# --- the real complete() with a fake SDK client


class FakeOpenAI:
    def __init__(self, response=None, error=None):
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))
        self.response, self.error = response, error

    def create(self, **kwargs):
        if self.error:
            raise self.error
        return self.response


def test_complete_returns_content(monkeypatch):
    response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="hi"))])
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    monkeypatch.setattr(ai, "OpenAI", lambda **kw: FakeOpenAI(response))
    assert ai.complete([]) == "hi"


def test_complete_turns_sdk_errors_into_aierror(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    error = APIConnectionError(request=SimpleNamespace())
    monkeypatch.setattr(ai, "OpenAI", lambda **kw: FakeOpenAI(error=error))
    with pytest.raises(ai.AIError):
        ai.complete([])


OVERLOADED = SimpleNamespace(
    choices=None,
    error={"message": "Upstream error from Nvidia: Service temporarily overloaded", "code": 503,
           "metadata": {"error_type": "provider_overloaded"}},
)
ANSWER = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="hi"))])


@pytest.fixture
def openrouter(monkeypatch):
    """Fake SDK client that returns the queued responses in order; records the retry pauses."""
    state = SimpleNamespace(responses=[], calls=0, sleeps=[])

    def create(**kwargs):
        state.calls += 1
        return state.responses.pop(0)

    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    monkeypatch.delenv("AI_STUB", raising=False)
    monkeypatch.setattr(ai, "OpenAI", lambda **kw: SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))))
    monkeypatch.setattr(ai.time, "sleep", state.sleeps.append)
    return state


def test_complete_retries_when_the_provider_is_overloaded(openrouter):
    # Regression: the free model's provider often answers 503 "overloaded" in a 200 body;
    # without a retry the user had to send every such message twice.
    openrouter.responses = [OVERLOADED, ANSWER]
    assert ai.complete([]) == "hi"
    assert openrouter.calls == 2
    assert openrouter.sleeps == [1]


def test_complete_gives_up_after_two_retries(openrouter):
    openrouter.responses = [OVERLOADED, OVERLOADED, OVERLOADED]
    with pytest.raises(ai.AIError, match="overloaded"):
        ai.complete([])
    assert openrouter.calls == 3
    assert openrouter.sleeps == [1, 2]


def test_complete_does_not_retry_other_errors(openrouter):
    openrouter.responses = [SimpleNamespace(choices=None, error={"message": "Bad request", "code": 400})]
    with pytest.raises(ai.AIError, match="Bad request"):
        ai.complete([])
    assert openrouter.calls == 1


def test_missing_api_key_is_a_clean_502(auth_client, board_url, monkeypatch):
    # Regression: os.environ["OPENROUTER_API_KEY"] raised KeyError, an unhandled 500.
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("AI_STUB", raising=False)
    with pytest.raises(ai.AIError):
        ai.complete([])
    assert chat(auth_client, board_url).status_code == 502


def test_complete_handles_openrouter_error_body(monkeypatch):
    # Regression: an overloaded free model returns 200 with choices=None and an error field.
    response = SimpleNamespace(choices=None, error={"message": "Service temporarily overloaded"})
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    monkeypatch.setattr(ai, "OpenAI", lambda **kw: FakeOpenAI(response))
    with pytest.raises(ai.AIError, match="overloaded"):
        ai.complete([])


# --- AI_STUB (offline mode used by the e2e tests)


def test_stub_mode(monkeypatch):
    monkeypatch.setenv("AI_STUB", "1")
    plain = json.loads(ai.complete([{"role": "user", "content": "hello"}]))
    assert plain == {"message": "Stub reply.", "operations": []}
    scripted = ai.complete([{"role": "user", "content": 'STUB:{"message": "x", "operations": []}'}])
    assert json.loads(scripted)["message"] == "x"
    with pytest.raises(ai.AIError):
        ai.complete([{"role": "user", "content": "please fail"}])
