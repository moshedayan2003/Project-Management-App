# Frontend

Kanban Studio: a single-board Kanban UI.

- Built as a static export (`output: "export"` in `next.config.ts`) into `out/`, served by the FastAPI backend at `/`.
- The board is loaded from and saved to the backend API (`lib/api.ts`), so it persists per user.

## Stack

| Area | Choice |
|------|--------|
| Framework | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Drag and drop | `@dnd-kit/core`, `@dnd-kit/sortable` |
| Unit tests | Vitest + Testing Library (jsdom) |
| E2E tests | Playwright (chromium) |
| Fonts | Space Grotesk (display), Manrope (body) via `next/font/google`; needs network at build time |

## Data model

```ts
Card      = { id, title, details }
Column    = { id, title, cardIds: string[] }
BoardData = { columns: Column[], cards: Record<string, Card> }
```

Column ids are fixed (`col-backlog`, `col-discovery`, `col-progress`, `col-review`, `col-done`); only titles change.

## Code layout (`src/`)

### App and lib

| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout, fonts, metadata |
| `app/page.tsx` | Renders `AuthGate` |
| `app/globals.css` | Tailwind import and CSS variables for the colour scheme (yellow, blue, purple, navy, gray) |
| `lib/kanban.ts` | Types (`Card`, `Column`, `BoardData`) and `moveCard`, the pure reorder / cross-column logic used for the instant drag update |
| `lib/api.ts` | `api.*` fetch wrappers for the board routes (each returns the full board), `api.chat`, and `ApiError` (carries the HTTP status) |

### Components

| File | Purpose |
|------|---------|
| `AuthGate.tsx` | Calls `/api/me` on load and shows `LoginForm` or `KanbanBoard`. Owns the login and logout calls. |
| `LoginForm.tsx` | Username/password form with an error message |
| `KanbanBoard.tsx` | Owns the board state (see below) |
| `KanbanColumn.tsx` | Droppable column with an editable title (`onRename` while typing, `onRenameCommit` on blur) and its card list |
| `KanbanCard.tsx` | Sortable card with Edit (inline title/details form; drag disabled while editing) and Remove buttons |
| `KanbanCardPreview.tsx` | Card visual used in the `DragOverlay` |
| `NewCardForm.tsx` | Collapsible add-card form per column |
| `ChatSidebar.tsx` | AI assistant panel (see below) |

### `KanbanBoard` behaviour

- Loads the board from `GET /api/board` and keeps it in `useState`.
- **Saving:** edit, delete and drag update the screen first, then save. If a save fails it shows an error and reloads the server's board. Add card waits for the server, which assigns the id. Column titles are saved on blur.
- **Drag and drop:** `DndContext` uses `pointerWithin`, falling back to `closestCorners`, so a card lands in the column under the pointer, including empty columns. `closestCorners` alone picked a neighbouring column's card.
- A 401 calls `onLogout`.
- Renders a Log out button, an error banner, and `ChatSidebar` (passing `setBoard` so applied AI changes show without a reload).
- The page wrapper must use `overflow-clip`, not `overflow-hidden`, or the sticky sidebar breaks.

### `ChatSidebar` behaviour

- **Placement:** stays in place while the page scrolls.
  - `xl` (1280px) and wider: a full-height sticky column to the right of the board.
  - Narrower: a floating panel pinned bottom-right.
- **Hide / show:** the Hide button animates it away completely (the column collapses to zero width, or the floating panel shrinks into the corner). A round purple AI button (`Show AI assistant`) appears bottom-right to bring it back. The panel stays mounted (`aria-hidden` and `inert` while hidden), so the conversation is kept.
- **Input:** an auto-growing textarea, up to 4 lines (108px), then it scrolls. Enter sends, Shift+Enter adds a new line.
- **Chat:** keeps the conversation in React state and sends `message` + `history` to `POST /api/chat` via `api.chat`. Shows a Thinking state and an error message.
- Calls `onBoardChange(board)` only when operations were applied. A 401 calls `onUnauthorized`.

## Tests

### Commands

- `npm run test:unit` (add `-- --coverage` for a coverage report)
- `npm run test:e2e` builds the static site, then Playwright starts the backend itself:
  - `uv run uvicorn` on 127.0.0.1:3000, with `STATIC_DIR=../frontend/out`, `DB_PATH` in the OS temp dir and `AI_STUB=1`
  - one worker, because all tests share one user and board
  - `uv` must be on PATH

### Helpers

| File | Purpose |
|------|---------|
| `src/test/fetch.ts` | `stubFetch` (fake server for unit tests) and `callsTo` |
| `src/test/fixtures.ts` | `defaultBoard`, a copy of the backend default board (also used by e2e). Keep it in sync with `board.default_board`. |
| `tests/helpers.ts` | `signInWithFreshBoard`: signs in via the API and resets the saved board to `defaultBoard` |

### Unit tests (Vitest)

| File | Covers |
|------|--------|
| `src/lib/kanban.test.ts` | `moveCard`: reorder, cross-column, drop on empty column area, unknown ids, no mutation |
| `src/components/KanbanBoard.test.tsx` | Loading, load failure, 401, rename on blur, add (success and failure), edit, delete, blank-title guards, cancel, failed save reloads the board, error clears |
| `src/components/ChatSidebar.test.tsx` | Empty input blocked, send, Enter / Shift+Enter, loading, history accumulates, board callback only when operations applied, skipped note, error, 401, hide and show keeping the conversation |
| `src/components/LoginForm.test.tsx` | Login form and error display |
| `src/components/AuthGate.test.tsx` | Signed out, signed in, API down, login, logout (mocked fetch) |

### E2E tests (Playwright)

| File | Covers |
|------|--------|
| `tests/kanban.spec.ts` | From a fresh board: load, add, edit, delete, rename column, blank-title guard, drag across and within columns |
| `tests/auth.spec.ts` | Login form on first visit, bad password, login persists across reload, logout, API 401 after logout |
| `tests/persistence.spec.ts` | Add, edit, rename, delete, drag and reorder survive a reload; changes survive logout/login; a second browser session sees them; 401 without sign-in |
| `tests/drag-targets.spec.ts` | Regression: dropping on an empty Backlog / Review column at several heights keeps the card there and saves it; dropping below the cards of a non-empty column |
| `tests/chat.spec.ts` | Uses `AI_STUB` (send `STUB:{json}` to script the reply): add, edit, move, delete, rename column, persistence, plain question, AI error, hide into the AI button and reopen |

## Known gaps versus the requirements

None for the MVP.
