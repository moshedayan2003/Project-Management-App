# Frontend

Kanban Studio: single-board Kanban UI. Built as a static export (`output: "export"` in `next.config.ts`, output in `out/`) and served by the FastAPI backend at `/`. The board is loaded from and saved to the backend API (see `lib/api.ts`), so it persists per user.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- Drag and drop: @dnd-kit/core and @dnd-kit/sortable
- Unit tests: Vitest + Testing Library (jsdom). E2E: Playwright (chromium)
- Fonts: Space Grotesk (display) and Manrope (body) via next/font/google (needs network at build time)

## Layout

- `src/app/layout.tsx` - root layout, fonts, metadata
- `src/app/page.tsx` - renders `AuthGate`
- `src/components/AuthGate.tsx` - client component; calls `/api/me` on load and shows `LoginForm` or `KanbanBoard`; owns login and logout calls
- `src/components/LoginForm.tsx` - username/password form with an error message
- `src/app/globals.css` - Tailwind import and CSS variables for the colour scheme (yellow, blue, purple, navy, gray)
- `src/lib/kanban.ts` - types (`Card`, `Column`, `BoardData`) and `moveCard` (pure reorder / cross-column move logic used for the instant drag update)
- `src/lib/api.ts` - `api.*` fetch wrappers for the board routes (each returns the full board) and `api.chat` and `ApiError` (carries the HTTP status)
- `src/components/ChatSidebar.tsx` - AI assistant panel that stays in place while the page scrolls: a full-height sticky column right of the board at `xl` (1280px) and wider, a floating panel pinned bottom-right on narrower screens (Hide button in its header). Hiding animates it away completely (the column collapses to zero width, or the floating panel shrinks into the corner) and a round purple AI button (`Show AI assistant`) appears bottom-right to bring it back; the panel stays mounted (`aria-hidden` and `inert` while hidden) so the conversation is kept. Sticky needs the page wrapper in `KanbanBoard` to use `overflow-clip`, not `overflow-hidden`. The message box is an auto-growing textarea (grows with its text up to 4 lines (108px), then scrolls; Enter sends, Shift+Enter adds a new line). Keeps the conversation in React state, sends `message` + `history` to `POST /api/chat` via `api.chat`, shows a Thinking state and an error message, and calls `onBoardChange(board)` only when operations were applied; a 401 calls `onUnauthorized`
- `src/components/KanbanBoard.tsx` - client component; loads the board from `GET /api/board`, keeps it in `useState`, wires up `DndContext` with a custom collision detection (`pointerWithin`, falling back to `closestCorners`): a card lands in the column under the pointer, including empty columns; `closestCorners` alone picked a neighbouring column's card. Edit, delete and drag update the screen first and then save; if saving fails it shows an error and reloads the server's board. Add card waits for the server (which assigns the id). Column titles are saved on blur. A 401 calls `onLogout`. Renders the `ChatSidebar` next to the board (passing `setBoard` so applied AI changes show without a reload). Shows a Log out button and an error banner
- `src/components/KanbanColumn.tsx` - droppable column with an editable title input (`onRename` while typing, `onRenameCommit` on blur) and card list
- `src/components/KanbanCard.tsx` - sortable card with Edit (inline title/details form, drag disabled while editing) and Remove buttons
- `src/components/KanbanCardPreview.tsx` - card visual used in the `DragOverlay`
- `src/components/NewCardForm.tsx` - collapsible add-card form per column

## Data model

```ts
Card = { id, title, details }
Column = { id, title, cardIds: string[] }
BoardData = { columns: Column[], cards: Record<string, Card> }
```

Column ids are fixed (`col-backlog`, `col-discovery`, `col-progress`, `col-review`, `col-done`); only titles change.

## Tests

- `src/test/fetch.ts` - `stubFetch` (fake server for unit tests) and `callsTo`; `src/test/fixtures.ts` - `defaultBoard` (mirrors the backend default board; also used by the e2e tests)
- `src/lib/kanban.test.ts` - `moveCard` (reorder, cross-column, drop on empty column area, unknown ids, no mutation)
- `src/components/KanbanBoard.test.tsx` - loading, load failure, 401, rename on blur, add (success and failure), edit, delete, blank-title guards, cancel, failed save reloads the board, error clears
- `src/components/ChatSidebar.test.tsx` - empty input blocked, send, Enter sends and Shift+Enter adds a line, loading, history accumulates, board callback only when operations applied, skipped note, error, 401, hide into the AI button and show again keeping the conversation
- `src/components/LoginForm.test.tsx`, `src/components/AuthGate.test.tsx` - login form, error display, gate behaviour with mocked fetch (signed out, signed in, API down, login, logout)
- `tests/auth.spec.ts` - Playwright: login form on first visit, bad password, login persists across reload, logout, API 401 after logout
- `tests/helpers.ts` - `signInWithFreshBoard`: signs in via the API and resets the saved board to `defaultBoard`
- `tests/persistence.spec.ts` - Playwright: add, edit, rename, delete, drag and reorder survive a reload; changes survive logout/login; a second browser session sees them; 401 without sign-in
- `tests/drag-targets.spec.ts` - Playwright regression: dropping on an empty Backlog / Review column at several heights keeps the card in that column and saves it; dropping below the cards of a non-empty column
- `tests/chat.spec.ts` - Playwright chat flows against the server started with `AI_STUB=1` (see `backend/app/ai.py`): send `STUB:{json}` to script the model's reply; add, edit, move, delete, rename column, persistence, plain question, AI error, hide completely into the AI button and reopen
- `tests/kanban.spec.ts` - Playwright (starts from a fresh board): load, add, edit, delete, rename column, blank-title guard, drag across columns and within a column
- Commands: `npm run test:unit` (add `-- --coverage` for a coverage report), `npm run test:e2e`. The e2e command builds the static site, then Playwright starts the backend (`uv run uvicorn`, `STATIC_DIR=../frontend/out`, `DB_PATH` in the OS temp dir) on 127.0.0.1:3000 with one worker (all tests share one user and board), so `uv` must be on PATH.

## Known gaps versus the requirements

- None for the MVP requirements.
