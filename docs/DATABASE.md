# Database

Machine-readable schema: [db-schema.json](db-schema.json). Status: approved and implemented in `backend/app/db.py` and `backend/app/board.py`.

## Approach

SQLite, one file, created automatically on startup if it does not exist (tables plus seed data). Two tables:

- `users` - `id`, `username` (unique), `password_hash` (NULL for now)
- `boards` - `id`, `user_id` (unique, foreign key), `data` (JSON text), `updated_at`

Each user's whole board is one JSON document in `boards.data`, in the same shape as the frontend `BoardData` type (`columns` with `cardIds`, plus a `cards` map). The same shape goes over the API and to and from the AI, so there is no conversion layer.

## Why a JSON document and not card tables

- One board per user, a handful of columns, tens of cards: reading and writing the whole board is trivial.
- The board is always loaded and shown as a whole, and the AI receives and changes it as a whole.
- Card order and moves are just list edits in `cardIds`; no position columns to renumber.
- Cost: no SQL queries over individual cards, and concurrent edits are last write wins. Neither matters for a single local user. If they ever do, `cards` can become a table without changing the API.

## Behaviour

- Startup: create the file and tables if missing; insert user `user` and its default board (the five columns and eight demo cards from the frontend) if absent.
- Reads: `SELECT data FROM boards WHERE user_id = ?`, parsed into a validated model.
- Writes: every change is applied to the parsed board in Python, re-validated against the rules in `db-schema.json`, then saved in a single `UPDATE` that also sets `updated_at`. Invalid boards are never stored.
- Multiple users: the schema already supports them; every query is scoped by the signed-in user's id.
- Multiple boards per user (future): drop `UNIQUE` on `boards.user_id` and add a `name` column.
- Location: env `DB_PATH`, default `backend/data/pm.db`. Tests use a temporary file per test.

## Docker

The container's database file lives in `/app/backend/data`. The start scripts mount the named volume `pm-data` there, so the board survives stop and start. Reset with `docker volume rm pm-data`.
