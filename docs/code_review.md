# Code Review

**Date:** 2026-10-14
**Scope:** the whole repo at commit `151f3ff` plus the current working tree: backend (`backend/app`, tests), frontend (`frontend/src`, e2e tests, configs), `Dockerfile`, `scripts/`, docs.
**Note:** file paths below refer to the layout at review time. The backend has since been reorganized into packages (see "Backend package restructure" in `PLAN.md`): `api.py` is now `routes/board.py`, `routes/chat.py` and `deps.py`; `board.py` is `models/board.py` and `services/board_ops.py`; `ai.py` is `services/ai.py`.
**Method:** read every source file. Findings marked "confirmed" were reproduced with a throwaway script against temporary databases (only `ai.complete` replaced), not inferred.

## Summary

The codebase is small, readable and well tested (77 backend tests at 99% coverage, 40 unit tests, 39 e2e tests, all passing). Board rules are enforced on every save, all SQL is parameterized, and React escapes all rendered text. No `dangerouslySetInnerHTML` is used.

The main problems are two ways a user's change can be **silently lost**:

- The chat route saves a board it loaded before the AI call.
- Board writes from overlapping requests are not serialized.

In both cases the UI keeps showing the change, so the user does not notice until they reload.

| ID | Severity | Area | Finding | Status |
|----|----------|------|---------|--------|
| H1 | High | Backend chat | Chat saves a stale board, reverting changes made while the AI was thinking | Fixed |
| M1 | Medium | Backend API | Overlapping writes lose updates (last write wins) | Fixed |
| M2 | Medium | Docker / auth | App is published on all network interfaces with known credentials and a public default session secret | Fixed |
| L1 | Low | Backend AI | Missing `OPENROUTER_API_KEY` gives 500, not the documented 502 | Fixed |
| L2 | Low | Backend board | AI `move_card` accepts a negative position | Fixed |
| L3 | Low | Frontend auth | A network error during login is unhandled; no message shown | From code |
| L4 | Low | Frontend a11y | Cards cannot be moved with the keyboard; card is a `role="button"` containing buttons | From code |
| L5 | Low | Frontend | Column rename sends a PATCH on every blur, even when unchanged | From code |
| L6 | Low | Backend | Chat message and history sizes are unbounded | From code |
| L7 | Low | Tooling | Tests run on Python 3.14 locally, but the image uses 3.12; `uv:latest` is unpinned | From code |

---

## High

### H1. Chat saves a stale board and reverts the user's changes

**Where:** `backend/app/api.py`, `chat()`.

**Problem:**

- `chat()` loads the board, then waits for the model, which takes 5 to 40 s on the free model.
- It then applies the operations to that old copy and always saves it.
- Any change the user makes in the meantime is overwritten. The sidebar does not block the board, so this is easy to hit: drag a card while the assistant is "Thinking".
- When the reply has no operations, the frontend does not refresh (`ChatSidebar` only calls `onBoardChange` when `applied` is non-empty). The screen keeps showing the user's change, but the server has reverted it.

**Evidence (confirmed):**

- The mocked model moved `card-1` to Done through the API while "thinking", then replied with no operations.
- After the chat returned 200, `card-1` was saved back in Backlog.

**Action:**

1. In `chat()`, load the board *after* `ai.chat(...)` returns. Use the pre-call board only for the prompt.
2. Save only when at least one operation was applied; otherwise return the current board unchanged.
3. Add a regression test in `tests/test_chat.py` that changes the board inside the mocked `ai.complete` and asserts the change survives. It must fail before the fix.

## Medium

### M1. Overlapping writes lose updates

**Where:** `backend/app/api.py`, `UserBoard.load()` / `save()`.

**Problem:**

- Every mutating route does load, then modify, then save, with no lock or transaction around the sequence.
- FastAPI runs these sync handlers in a thread pool, so two requests can both load the same board, and the second save discards the first.
- The frontend sends saves without waiting (drag, then rename, then edit in quick succession) and ignores the returned board for moves, edits and deletes. So the UI shows both changes while only one is stored.
- The window is a few milliseconds per request, so it is rare in normal use. When it does happen, data is lost silently.

**Evidence (confirmed):**

- With `db.get_board` slowed by 0.3 s, two concurrent moves (`card-1` and `card-3` to Done) both returned 200.
- Only `card-3` was saved; `card-1` stayed in Backlog.

**Action:**

1. Serialize load-modify-save, keeping the slow AI call outside the critical section. The simplest fit for a single-process local app is a module-level `threading.Lock` held from `load()` through `save()`. An alternative is to do the read and write in one SQLite `BEGIN IMMEDIATE` transaction.
2. Add a threaded regression test like the evidence above.

### M2. App is reachable from the network with known credentials and secret

**Where:** `scripts/start.sh`, `scripts/start.ps1`, `backend/app/main.py`.

**Problem:**

- `docker run -p 8000:8000` publishes on `0.0.0.0` (seen in `docker ps`: `0.0.0.0:8000->8000/tcp`), so anyone on the same network can open the app.
- The login is `user` / `password`.
- `SESSION_SECRET` defaults to `dev-only-secret-change-me`, which is public in the repo, and neither the Dockerfile nor the scripts set it. Unless `.env` sets it, anyone can forge a valid session cookie without logging in.
- Anyone who gets in can also spend the OpenRouter key's quota through `/api/chat`.

The hardcoded login is an accepted MVP limitation. Exposing it beyond localhost is not.

**Action:**

1. Publish on localhost only: `-p 127.0.0.1:8000:8000` in both start scripts. This is a one-line change each and makes the other two points local-only.
2. Optionally, add `SESSION_SECRET=` to the README's `.env` instructions.

## Low

### L1. Missing API key returns 500 instead of 502

**Where:** `backend/app/ai.py`, `complete()`.

**Problem:** `os.environ["OPENROUTER_API_KEY"]` is read outside the `try`, so a missing key raises `KeyError`, giving an unhandled 500. The docs say any AI failure is a 502. Users see the same generic sidebar error either way, but the server logs a traceback instead of a clean error.

**Evidence (confirmed):** `/api/chat` with the key removed from the environment returned 500.

**Action:** Build the client inside the `try` (`OpenAI(...)` raises `OpenAIError` when the key is missing), or use `os.environ.get` and raise `AIError`. Add a test.

### L2. AI can move a card to a negative position

**Where:** `backend/app/board.py`, `move_card()`; `backend/app/ai.py`, `MoveCard`.

**Problem:**

- The REST route validates `position >= 0`, but `ai.MoveCard.position` has no bound.
- `list.insert(-1, ...)` puts the card second from the end instead of rejecting or clamping it.

**Evidence (confirmed):** an AI `move_card` with `position: -1` into Done gave `['card-7', 'card-1', 'card-8']`.

**Action:** Clamp in `board.move_card` (`position = max(0, position)`), which covers both callers, or add `Field(ge=0)` to `ai.MoveCard.position`. Add a test.

### L3. Login network error is unhandled

**Where:** `frontend/src/components/AuthGate.tsx`, `handleLogin`; `LoginForm.tsx`.

**Problem:** if `fetch("/api/login")` rejects (server down), the promise rejection escapes `handleSubmit`. No error is shown and the console gets an unhandled rejection.

**Action:** Catch the failure in `LoginForm.handleSubmit` and show "Could not reach the server." Add a Vitest case.

### L4. Keyboard and screen-reader access to cards

**Where:** `frontend/src/components/KanbanBoard.tsx`, `KanbanCard.tsx`.

**Problem:**

- Only `PointerSensor` is registered, so cards cannot be moved with the keyboard.
- The sortable `attributes` give the `<article>` `role="button"`, so each card is announced as a button containing the Edit and Remove buttons. The e2e page snapshot shows this nesting.

**Action (optional for the MVP):**

1. Add `KeyboardSensor` with `sortableKeyboardCoordinates`.
2. Consider a drag handle, so the card itself is not a button.

### L5. Column rename saves on every blur

**Where:** `frontend/src/components/KanbanColumn.tsx`.

**Problem:** `onBlur` always calls `onRenameCommit`, so clicking into a title and out again sends a PATCH with no change. This is harmless, but it is an extra write that also widens the M1 window.

**Action:** Skip the commit when the title equals the title at focus time.

### L6. Unbounded chat input

**Where:** `backend/app/api.py`, `ChatRequest`; `backend/app/ai.py`, `ChatMessage`.

**Problem:** `message` and `history` have no maximum size. A long session sends an ever-growing history to the free model, which gets slower and eventually exceeds its context limit.

**Action (optional):** Cap `message` length (for example `max_length=4000`), and send only the last N history messages.

### L7. Toolchain drift

**Where:** `backend/.venv`, `Dockerfile`.

**Problem:**

- Local tests run on Python 3.14.2, but the image runs 3.12, so the 3.12 code path is only exercised by the Docker test.
- `COPY --from=ghcr.io/astral-sh/uv:latest` makes builds non-reproducible.
- The container runs as root. This is acceptable for a local MVP.

**Action (optional):**

1. Add `backend/.python-version` with `3.12` so `uv` uses the same version locally.
2. Pin the uv image tag.

---

## What is good

- **Simple, layered design:** pure board operations (`board.py`) reused by both REST and AI, one JSON shape everywhere, one network function (`ai.complete`).
- **Validation:** the `Board` model rejects any inconsistent board before it is stored, and AI operations are applied one at a time on a copy, so a bad operation is skipped rather than corrupting data.
- **Error handling where it matters:** OpenRouter's 200-with-error body, malformed model output, and 401 anywhere in the UI returning to the login form.
- **Tests:**
  - They mock only the external service and use real temporary SQLite files.
  - The Part 7 drag regression is still caught: all 9 drag tests fail against plain `closestCorners`.
  - E2E tests run against the real server.
- **Security basics:** parameterized SQL only, HttpOnly SameSite=Lax cookies, every board query scoped to the session user, `.env` git-ignored and docker-ignored.

## Actions, in order

| # | Action | Finding | Effort |
|---|--------|---------|--------|
| 1 | Done: apply the chat's operations to the board as it is after the AI call (via the locked `update()`, so no stale save); regression tests added | H1 | Small |
| 2 | Done: serialize load-modify-save with a lock (AI call outside it); threaded regression test added | M1 | Small |
| 3 | Done: publish the container on `127.0.0.1:8000` only, in both start scripts | M2 | Trivial |
| 4 | Done: turn a missing API key into `AIError` (502); test added | L1 | Trivial |
| 5 | Done: clamp negative positions in `board.move_card`; test added | L2 | Trivial |
| 6 | Show an error when the login request cannot reach the server; add a test | L3 | Small |
| 7 | Skip the rename PATCH when the title is unchanged | L5 | Trivial |
| 8 | Optional: keyboard drag support and a drag handle | L4 | Medium |
| 9 | Optional: cap chat message and history size | L6 | Small |
| 10 | Optional: `.python-version` 3.12 and a pinned uv image | L7 | Trivial |

Each fix follows the project rule: the regression test must fail before the fix and pass after.

## Fixes applied (actions 1 to 5)

Five regression tests were added and all five failed before the fixes:

- `test_chat.py`: `test_plain_reply_keeps_changes_made_while_thinking`, `test_operations_apply_to_the_latest_board` and `test_missing_api_key_is_a_clean_502`
- `test_api.py`: `test_overlapping_moves_are_both_saved`
- `test_board.py`: `test_move_card_clamps_negative_position`

| Finding | Fix |
|---------|-----|
| H1, M1 | `api.py`: `UserBoard.save()` is replaced by `UserBoard.update(change)`, which loads, changes, validates and saves under one module-level lock. Every mutating route goes through it. `chat()` calls the model with no lock held, then applies the operations inside `update()` to the board as it is at that moment. |
| M2 | `scripts/start.sh` and `scripts/start.ps1` publish on `127.0.0.1:8000` (confirmed in `docker ps`: `127.0.0.1:8000->8000/tcp`). The Docker test's container is bound the same way. |
| L1 | `ai.complete` raises `AIError` when the key is missing, so the route returns 502. It does not pass `None` to the SDK, which would silently fall back to `OPENAI_API_KEY`. |
| L2 | `board.move_card` clamps the position to 0 or more. |

Results after the fixes:

| Suite | Result |
|-------|--------|
| Backend | 82 passed, 99% coverage |
| Live AI + Docker | 6 passed |
| Playwright | 39 passed |
| Start script | Container healthy, then stopped |
