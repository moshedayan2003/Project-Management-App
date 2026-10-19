# Code Review

**Date:** 2026-10-15
**Scope:** the whole repo at commit `8572ad6` plus the uncommitted package upgrade (Next.js 16.4.1, React 19.3.1, Vitest 5, Node 24 in Docker, the `chat.spec.ts` timing fix).
**Method:** read every source file, config and script. Findings marked "confirmed" were reproduced with a throwaway script against a temporary database (only `ai.complete` replaced). The rest are from reading the code.
**Previous review:** 2026-10-14 (in git history). Its five fixed findings are still fixed. Its five open findings are still open and listed again below.

## Summary

The code is small, clear and well layered. Every board write is locked and validated, all SQL is parameterized, and React escapes all text. All tests pass:

| Suite | Result |
|-------|--------|
| Backend (pytest) | 85 passed, 99% coverage |
| Frontend unit (Vitest 5) | 40 passed |
| End-to-end (Playwright) | 39 passed |
| Lint | clean |

The uncommitted package upgrade looks correct. The test setup import and the polling fix in `chat.spec.ts` are the right changes for Vitest 5 and the newer Playwright.

There are no high-severity problems. The main new finding is that one bad operation from the AI throws away the whole reply.

| ID | Severity | Area | Finding | Status |
|----|----------|------|---------|--------|
| M1 | Medium | Backend chat | One malformed AI operation discards the whole reply (502) | Confirmed, new |
| L1 | Low | Frontend auth | A network error during login shows no message | Open since last review |
| L2 | Low | Frontend | Column rename saves on every blur, even when unchanged | Open since last review |
| L3 | Low | Frontend a11y | Cards cannot be moved with the keyboard; card is a button that contains buttons | Open since last review |
| L4 | Low | Backend | Chat message and history sizes are unbounded | Open since last review |
| L5 | Low | Tooling | Python 3.14 locally vs 3.12 in Docker; `uv:latest` is unpinned | Open since last review |
| L6 | Low | Tests | Playwright reuses any server already on port 3000 | New |
| L7 | Low | Repo | `frontend/test-results/.last-run.json` is committed although ignored | New |

---

## Medium

### M1. One malformed AI operation throws away the whole reply

**Where:** `backend/app/services/ai.py`, `Reply` and `chat()`; `backend/app/routes/chat.py`.

**Problem:**

- `Reply.operations` is a strict list of typed operations, so the whole reply is validated at once.
- If the model gets just one operation wrong (for example a `move_card` without `column_id`), validation fails and the user gets a 502 error.
- The valid operations and the model's message are lost too. The plan says invalid operations should be skipped and reported, and the route already does that for unknown ids, but not for badly formed operations.
- The free model is not very reliable, so this is likely to happen in real use.

**Evidence (confirmed):** a mocked reply with one valid `create_card` and one `move_card` missing `column_id` returned `502 {"detail": "AI returned an invalid reply"}`. Nothing was applied.

**Action:**

1. Keep the strict schema in the `response_format` sent to the model, but parse `operations` loosely (a list of plain objects).
2. In `apply_all`, validate each operation on its own (for example with a `TypeAdapter(ai.Operation)`) and add failures to `skipped`, the same way unknown ids are handled.
3. Add a regression test in `tests/test_chat.py` with one valid and one malformed operation. It must fail before the fix.

## Low

### L1. Login network error shows nothing

**Where:** `frontend/src/components/AuthGate.tsx`, `handleLogin`; `LoginForm.tsx`, `handleSubmit`.

**Problem:** if the server cannot be reached, `fetch("/api/login")` rejects. The error escapes `handleSubmit`, no message is shown, and the console logs an unhandled rejection.

**Action:** catch it in `LoginForm.handleSubmit` and show "Could not reach the server." Add a Vitest case.

### L2. Column rename saves on every blur

**Where:** `frontend/src/components/KanbanColumn.tsx`, line 49.

**Problem:** clicking into a column title and out again sends a PATCH even when nothing changed. Harmless, but it is an extra write each time.

**Action:** skip the save when the title is the same as when the input got focus.

### L3. Keyboard and screen-reader access to cards

**Where:** `frontend/src/components/KanbanBoard.tsx`, `KanbanCard.tsx`.

**Problem:**

- Only `PointerSensor` is registered, so cards cannot be moved with the keyboard.
- The drag `attributes` make each `<article>` a `role="button"`, which contains the Edit and Remove buttons. Screen readers announce a button inside a button.

**Action (optional for the MVP):** add `KeyboardSensor` with `sortableKeyboardCoordinates`, and consider a small drag handle so the card itself is not a button.

### L4. Unbounded chat input

**Where:** `backend/app/routes/chat.py`, `ChatRequest`; `backend/app/services/ai.py`, `ChatMessage`.

**Problem:** `message` and `history` have no size limit. A long chat sends more and more history to the free model, which gets slower and can go over its context limit.

**Action (optional):** cap `message` length and send only the last N history messages.

### L5. Toolchain drift

**Where:** `backend/`, `Dockerfile` line 9.

**Problem:**

- Tests run on Python 3.14 locally, but the image uses 3.12. Only the Docker test runs the code on 3.12.
- `ghcr.io/astral-sh/uv:latest` can change between builds.
- Node is now aligned (24 both locally and in Docker).

**Action (optional):** add `backend/.python-version` with `3.12`, and pin the uv image tag.

### L6. Playwright reuses whatever is on port 3000

**Where:** `frontend/playwright.config.ts`, `reuseExistingServer: true`.

**Problem:** if a server is already running on port 3000, Playwright uses it instead of starting its own. If that server was started without `AI_STUB` or with the real `DB_PATH`, the chat tests call the real model (using up the 50 free requests per day), and the test helper replaces that database's board with the demo board.

**Action:** set `reuseExistingServer: false`, so the tests always start their own server with the stub and the temporary database.

### L7. Test output file is committed

**Where:** `frontend/test-results/.last-run.json`.

**Problem:** `frontend/.gitignore` ignores `/test-results/`, but this file was committed before that rule was added, so git still tracks it.

**Action:** remove it from git with `git rm --cached frontend/test-results/.last-run.json` (the user does git operations).

---

## What is good

- **Clear layers:** models, pure board operations, routes. The same operations serve the REST routes and the AI.
- **Safe writes:** every change goes through `UserBoard.update()`, which loads, changes, validates and saves under one lock. The slow AI call happens outside the lock and its operations are applied to the latest board.
- **Strong validation:** the `Board` model rejects any inconsistent board. AI operations are applied one at a time on a copy, so a bad operation never leaves the board half changed.
- **Error handling where it matters:** missing API key, OpenRouter's 200-with-error body, overload retries, and 401 anywhere in the UI returning to the login form.
- **Tests:** real temporary SQLite files, only `ai.complete` mocked, end-to-end tests against the real server with a stub model.
- **Security basics:** parameterized SQL, HttpOnly SameSite=Lax cookies, every query scoped to the signed-in user, `.env` excluded from git and Docker, container published on `127.0.0.1` only.

## Actions, in order

| # | Action | Finding | Effort |
|---|--------|---------|--------|
| 1 | Validate AI operations one by one and skip bad ones; add a regression test | M1 | Small |
| 2 | Show an error when login cannot reach the server; add a test | L1 | Small |
| 3 | Set `reuseExistingServer: false` in the Playwright config | L6 | Trivial |
| 4 | Remove `.last-run.json` from git | L7 | Trivial |
| 5 | Skip the rename save when the title is unchanged | L2 | Trivial |
| 6 | Optional: keyboard drag and a drag handle | L3 | Medium |
| 7 | Optional: cap chat message and history size | L4 | Small |
| 8 | Optional: `.python-version` 3.12 and a pinned uv image | L5 | Trivial |

Each fix follows the project rule: its regression test must fail before the fix and pass after.
