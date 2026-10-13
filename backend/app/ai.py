import json
import os
from pathlib import Path
from typing import Annotated, Literal

from dotenv import load_dotenv
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field, ValidationError

from app.board import Board

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"

SYSTEM_PROMPT = """You are the assistant inside a Kanban project board app.
The board is JSON: five fixed columns (id, title, cardIds) and a map of cards (id, title, details).
Columns cannot be added, removed or reordered; you may only rename them.
Refer to cards and columns by their ids. A new card is created in a column.
When the user asks for a change, put it in `operations` (in order) and say what you did in `message`.
When the user only asks a question or chats, leave `operations` empty.
Only use ids that exist in the board. Reply briefly.

Current board:
"""


class AIError(Exception):
    pass


class CreateCard(BaseModel):
    type: Literal["create_card"]
    column_id: str
    title: str
    details: str = ""


class UpdateCard(BaseModel):
    type: Literal["update_card"]
    card_id: str
    title: str | None = None
    details: str | None = None


class MoveCard(BaseModel):
    type: Literal["move_card"]
    card_id: str
    column_id: str
    position: int | None = None


class DeleteCard(BaseModel):
    type: Literal["delete_card"]
    card_id: str


class RenameColumn(BaseModel):
    type: Literal["rename_column"]
    column_id: str
    title: str


Operation = Annotated[
    CreateCard | UpdateCard | MoveCard | DeleteCard | RenameColumn, Field(discriminator="type")
]


class Reply(BaseModel):
    message: str
    operations: list[Operation] = []


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


def stub_complete(messages: list[dict]) -> str:
    """Offline stand-in used when AI_STUB is set (e2e tests). A message starting with
    "STUB:" followed by JSON is returned as the model's reply; "fail" raises; anything else
    is a plain answer with no operations."""
    last = messages[-1]["content"]
    if last.startswith("STUB:"):
        return last.removeprefix("STUB:")
    if "fail" in last:
        raise AIError("AI request failed: stubbed failure")
    return json.dumps({"message": "Stub reply.", "operations": []})


def complete(messages: list[dict], response_format: dict | None = None) -> str:
    """One OpenRouter call; returns the reply text. The only function that touches the network."""
    if os.environ.get("AI_STUB"):
        return stub_complete(messages)
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
        timeout=60,
        max_retries=0,
    )
    kwargs = {"response_format": response_format} if response_format else {}
    try:
        response = client.chat.completions.create(model=MODEL, messages=messages, **kwargs)
    except OpenAIError as error:
        raise AIError(f"AI request failed: {error}") from error
    if not response.choices:
        # OpenRouter reports upstream failures (e.g. the free model overloaded) in a 200 body.
        error = getattr(response, "error", None)
        raise AIError(f"AI request failed: {error or 'empty response'}")
    return response.choices[0].message.content or ""


def ask(prompt: str) -> str:
    return complete([{"role": "user", "content": prompt}])


def chat(board: Board, history: list[ChatMessage], message: str) -> Reply:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT + board.model_dump_json()},
        *[m.model_dump() for m in history],
        {"role": "user", "content": message},
    ]
    response_format = {
        "type": "json_schema",
        "json_schema": {"name": "reply", "schema": Reply.model_json_schema()},
    }
    text = complete(messages, response_format)
    try:
        return Reply.model_validate_json(text)
    except ValidationError as error:
        raise AIError("AI returned an invalid reply") from error
