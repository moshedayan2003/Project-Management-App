# Frontend

Kanban Studio: single-board Kanban UI. Built as a static export (`output: "export"` in `next.config.ts`, output in `out/`) and served by the FastAPI backend at `/`. State is still held in memory in React and resets on reload; the only API calls are the sign-in ones (`/api/me`, `/api/login`, `/api/logout`); board persistence is not wired up yet.

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
- `src/lib/kanban.ts` - types (`Card`, `Column`, `BoardData`), `initialData` seed (5 columns, 8 cards), `moveCard` (pure reorder / cross-column move logic), `createId`
- `src/components/KanbanBoard.tsx` - client component; owns all board state in `useState`, wires up `DndContext`, and implements rename column, add card, update card, delete card and drag end handlers; takes an `onLogout` prop and shows a Log out button
- `src/components/KanbanColumn.tsx` - droppable column with an editable title input and card list
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

- `src/lib/kanban.test.ts` - `moveCard` (reorder, cross-column, drop on empty column area)
- `src/components/KanbanBoard.test.tsx` - five columns, rename column, add / remove / edit card, blank-title guards, cancel
- `src/components/LoginForm.test.tsx`, `src/components/AuthGate.test.tsx` - login form, error display, gate behaviour with mocked fetch (signed out, signed in, API down, login, logout)
- `tests/auth.spec.ts` - Playwright: login form on first visit, bad password, login persists across reload, logout, API 401 after logout
- `tests/kanban.spec.ts` - Playwright (signs in via the API in `beforeEach`): load, add, edit, delete, rename column, blank-title guard, drag across columns and within a column
- Commands: `npm run test:unit` (add `-- --coverage` for a coverage report), `npm run test:e2e`. The e2e command builds the static site, then Playwright starts the backend (`uv run uvicorn`, `STATIC_DIR=../frontend/out`) on 127.0.0.1:3000, so `uv` must be on PATH.

## Known gaps versus the requirements

- Board is not persisted; no AI sidebar.
