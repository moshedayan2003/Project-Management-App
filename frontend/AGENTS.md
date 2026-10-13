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
- `src/lib/api.ts` - `api.*` fetch wrappers for the board routes (each returns the full board) and `ApiError` (carries the HTTP status)
- `src/components/KanbanBoard.tsx` - client component; loads the board from `GET /api/board`, keeps it in `useState`, wires up `DndContext` with a custom collision detection (`pointerWithin`, falling back to `closestCorners`): a card lands in the column under the pointer, including empty columns; `closestCorners` alone picked a neighbouring column's card. Edit, delete and drag update the screen first and then save; if saving fails it shows an error and reloads the server's board. Add card waits for the server (which assigns the id). Column titles are saved on blur. A 401 calls `onLogout`. Shows a Log out button and an error banner
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
- `src/components/LoginForm.test.tsx`, `src/components/AuthGate.test.tsx` - login form, error display, gate behaviour with mocked fetch (signed out, signed in, API down, login, logout)
- `tests/auth.spec.ts` - Playwright: login form on first visit, bad password, login persists across reload, logout, API 401 after logout
- `tests/helpers.ts` - `signInWithFreshBoard`: signs in via the API and resets the saved board to `defaultBoard`
- `tests/persistence.spec.ts` - Playwright: add, edit, rename, delete, drag and reorder survive a reload; changes survive logout/login; a second browser session sees them; 401 without sign-in
- `tests/drag-targets.spec.ts` - Playwright regression: dropping on an empty Backlog / Review column at several heights keeps the card in that column and saves it; dropping below the cards of a non-empty column
- `tests/kanban.spec.ts` - Playwright (starts from a fresh board): load, add, edit, delete, rename column, blank-title guard, drag across columns and within a column
- Commands: `npm run test:unit` (add `-- --coverage` for a coverage report), `npm run test:e2e`. The e2e command builds the static site, then Playwright starts the backend (`uv run uvicorn`, `STATIC_DIR=../frontend/out`, `DB_PATH` in the OS temp dir) on 127.0.0.1:3000 with one worker (all tests share one user and board), so `uv` must be on PATH.

## Known gaps versus the requirements

- No AI sidebar yet.
