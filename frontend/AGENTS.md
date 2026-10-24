# Frontend

Kanban Studio: user accounts, several Kanban boards per user, and an AI assistant.

- Built as a static export (`output: "export"` in `next.config.ts`) into `out/`, served by the FastAPI backend at `/`.
- Boards are loaded from and saved to the backend API (`lib/api.ts`), so they persist per user.

## Stack

| Area | Choice |
|------|--------|
| Framework | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Drag and drop | `@dnd-kit/core`, `@dnd-kit/sortable` |
| Icons | `lucide-react` (pinned) |
| Unit tests | Vitest + Testing Library (jsdom) |
| E2E tests | Playwright (chromium) |
| Fonts | Space Grotesk (display), Manrope (body) via `next/font/google`; needs network at build time |

## Data model

```ts
Priority     = "low" | "medium" | "high"
Card         = { id, title, details, priority: Priority | null, due_date: string | null, labels: string[] }
Column       = { id, title, cardIds: string[] }
BoardData    = { columns: Column[], cards: Record<string, Card> }
BoardSummary = { id, name, created_at, updated_at, card_count }   // lib/api.ts
User         = { id, username }                                   // lib/api.ts
```

`due_date` is `YYYY-MM-DD`.

Column ids are fixed (`col-backlog`, `col-discovery`, `col-progress`, `col-review`, `col-done`); only titles change.

## Code layout (`src/`)

### App and lib

| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout, fonts, metadata |
| `app/page.tsx` | Renders `AuthGate` |
| `app/globals.css` | Tailwind import and CSS variables for the colour scheme (yellow, blue, purple, navy, gray) |
| `lib/kanban.ts` | Types and pure helpers: `moveCard` (reorder / cross-column logic for the instant drag update), `matchesFilter` (search words and priority), `today`, `isOverdue`, `parseLabels` |
| `lib/api.ts` | `api.*` fetch wrappers for every backend route (account, board list, board content, chat; board content calls take the board id and return the full board) and `ApiError` (carries the HTTP status). A 204 resolves to `undefined`. |

### Components

| File | Purpose |
|------|---------|
| `AuthGate.tsx` | Calls `/api/me` on load and shows `LoginForm` or `Workspace`. Owns sign in, register and logout, and turns failures into messages (401, 409 taken, 422 rules). |
| `LoginForm.tsx` | Sign in / Create account form (one form, a link switches mode) with an error message. Exports `inputClass` and `labelClass`. |
| `Workspace.tsx` | The signed-in app (see below) |
| `BoardSwitcher.tsx` | Board picker (`select`, label "Board") with New, Rename and Delete icon buttons; New and Rename swap the picker for a name field (Escape cancels) |
| `AccountDialog.tsx` | Modal: change password, delete account (asks to confirm). Closes on the X, Escape or a click outside. |
| `KanbanBoard.tsx` | One board: owns its state (see below) |
| `KanbanColumn.tsx` | Droppable column: editable title (`onRename` while typing, `onRenameCommit` on blur), card count badge, its card list, then `NewCardForm` |
| `KanbanCard.tsx` | Sortable card showing priority, due date (red when `overdue`) and label chips. Pencil (Edit: inline form for title, details, priority, due date and comma-separated labels; drag disabled while editing) and trash (Delete) icon buttons. With a mouse the icons appear on hover over the title's corner; on touch screens (`pointer-coarse`) they always show and the title leaves room for them |
| `KanbanCardPreview.tsx` | Card visual used in the `DragOverlay` |
| `NewCardForm.tsx` | Collapsible add-card form per column |
| `ChatSidebar.tsx` | AI assistant panel (see below) |

### `Workspace` behaviour

- Loads the board list, then opens the last board opened in this browser (`localStorage` key `pm-board`, guarded with try/catch) or the first board.
- Renders the header (logo, `BoardSwitcher`, account button with the username, Log out) and any board-list error, and passes them to `KanbanBoard` as `header`, so the board's layout (with the sticky chat column) is unchanged.
- `KanbanBoard` gets `key={boardId}`: switching boards starts fresh, including the chat conversation.
- Creating a board opens it. Deleting asks to confirm, then opens the first remaining board; with no boards left it shows "No boards yet" (the + button still works).
- A 401 from any call, and a deleted account, call `onLogout`.

### `KanbanBoard` behaviour

- Takes `boardId`, `header` and `onLogout`. Loads the board from `GET /api/boards/{id}` and keeps it in `useState`.
- **Saving:** edit, delete and drag update the screen first, then save. If a save fails it shows an error and reloads the server's board. Add card waits for the server, which assigns the id. Column titles are saved on blur.
- **Drag and drop:** `DndContext` uses `pointerWithin`, falling back to `closestCorners`, so a card lands in the column under the pointer, including empty columns. `closestCorners` alone picked a neighbouring column's card.
- A 401 calls `onLogout`.
- Renders the given header, a toolbar (card count, or "Showing X of Y cards" while filtering; search box; priority filter), an error banner, and `ChatSidebar` (passing `setBoard` so applied AI changes show without a reload).
- **Filtering** only changes what is shown: each column gets its matching cards and its count badge follows them. Dragging still works; positions are computed on the full column.
- **Overdue:** a card is overdue when its due date is before today (local time) and it is not in the Done column.
- **Layout:** the board grid fits as many columns per row as it can at 10.5rem or wider (`repeat(auto-fit, minmax(10.5rem, 1fr))`); columns that do not fit wrap onto the next row, so there is never sideways scrolling (also when zoomed in). Rows stretch to the bottom of the window and the page scrolls when the cards need more room. At 1280px with the sidebar open all five still fit in one row, which the drag e2e tests rely on. Column titles shrink in columns under 12rem (container query). Below `sm` the columns stack.
- The page wrapper must use `overflow-clip`, not `overflow-hidden`, or the sticky sidebar breaks.

### `ChatSidebar` behaviour

- **Placement:** stays in place while the page scrolls.
  - `xl` (1280px) and wider: a full-height sticky column to the right of the board.
  - Narrower: a floating panel pinned bottom-right. It starts hidden there (`matchMedia`), so it does not cover the board, and is never taller than the window; `src/test/setup.ts` stubs `matchMedia` as a wide screen.
- **Hide / show:** the Hide icon button animates it away completely (the column collapses to zero width, or the floating panel shrinks into the corner). A round purple AI button (`Show AI assistant`) appears bottom-right to bring it back. The panel stays mounted (`aria-hidden` and `inert` while hidden), so the conversation is kept.
- **Input:** an auto-growing textarea, up to 4 lines (108px), then it scrolls. Enter sends, Shift+Enter adds a new line.
- **Chat:** keeps the conversation in React state and sends `message` + `history` to `POST /api/boards/{id}/chat` via `api.chat`. Shows a Thinking state and an error message.
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
| `src/test/fixtures.ts` | `defaultBoard`, a copy of the backend default board (also used by e2e; keep it in sync with `default_board()` in `backend/app/models/board.py`), `card()` and `boardSummary()` builders |
| `tests/helpers.ts` | `signInWithFreshBoard` (signs in as `user` and resets it to one board "My board" holding `defaultBoard`), `boardUrl` / `savedBoard` (that board over the API), `registerNewUser` (a fresh account with a unique name, signed in) |

### Unit tests (Vitest)

| File | Covers |
|------|--------|
| `src/lib/kanban.test.ts` | `moveCard`: reorder, cross-column, drop on empty column area, unknown ids, no mutation. `matchesFilter`, `today`, `isOverdue`, `parseLabels` |
| `src/components/KanbanBoard.test.tsx` | Loading, load failure, 401, rename on blur, add (success and failure), edit, delete, blank-title guards, cancel, failed save reloads the board, error clears, header shown, setting and clearing priority / due date / labels, overdue except in Done, search and priority filters |
| `src/components/Workspace.test.tsx` | Opens the first or the remembered board, switching, create (and blank / Escape), rename, delete with confirm, empty state, errors, 401, log out; account dialog: change password (and each error), delete account (confirm, wrong password), closing |
| `src/components/ChatSidebar.test.tsx` | Empty input blocked, send, Enter / Shift+Enter, loading, history accumulates, board callback only when operations applied, skipped note, error, 401, hide and show keeping the conversation, starts hidden on narrow screens |
| `src/components/LoginForm.test.tsx` | Sign in, error display, switching to Create account and back |
| `src/components/AuthGate.test.tsx` | Signed out, signed in, API down, login, logout, register and its error messages (mocked fetch) |

### E2E tests (Playwright)

| File | Covers |
|------|--------|
| `tests/accounts.spec.ts` | Create an account (empty board, survives reload, sign in again), taken and invalid names, users only see their own boards, change password, delete account |
| `tests/boards.spec.ts` | Create a second board with its own cards, a reload reopens the open board, rename, delete with confirm and cancel, delete the last board then create one, the AI only changes the open board and each board has its own chat |
| `tests/card-fields.spec.ts` | Set priority, due date (overdue) and labels and see them after a reload; the AI sets them; search and priority filter |
| `tests/kanban.spec.ts` | From a fresh board: load, add, edit, delete, rename column, blank-title guard, drag across and within columns |
| `tests/auth.spec.ts` | Login form on first visit, bad password, login persists across reload, logout, API 401 after logout |
| `tests/persistence.spec.ts` | Add, edit, rename, delete, drag and reorder survive a reload; changes survive logout/login; a second browser session sees them; 401 without sign-in |
| `tests/drag-targets.spec.ts` | Regression: dropping on an empty Backlog / Review column at several heights keeps the card there and saves it; dropping below the cards of a non-empty column |
| `tests/layout.spec.ts` | Zoomed-in windows: at 781 wide the Done column wraps onto a second row with no sideways overflow, and a card can be dragged into it; at 640x360 the opened assistant fits and can be hidden |
| `tests/chat.spec.ts` | Uses `AI_STUB` (send `STUB:{json}` to script the reply): add, edit, move, delete, rename column, persistence, plain question, AI error, hide into the AI button and reopen |

## Known gaps versus the requirements

None for the MVP.
