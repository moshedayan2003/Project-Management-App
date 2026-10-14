# Database

**Status:** approved and implemented in `backend/app/db.py` and `backend/app/board.py`.
**Schema file:** [db-schema.json](db-schema.json) (machine-readable).

## Summary

One SQLite file, created automatically on startup (tables plus seed data) if it does not exist. Each user's whole board is stored as a single JSON document.

## Tables

| Table    | Columns |
|----------|---------|
| `users`  | `id`, `username` (unique), `password_hash` (NULL for now) |
| `boards` | `id`, `user_id` (unique, foreign key to `users`), `data` (JSON text), `updated_at` |

## Board JSON (`boards.data`)

Same shape as the frontend `BoardData` type:

```json
{
  "columns": [{ "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"] }],
  "cards":   { "card-1": { "id": "card-1", "title": "...", "details": "..." } }
}
```

This shape is used everywhere: in the database, over the API, and to and from the AI. There is no conversion layer.

## Why one JSON document instead of card tables

**Benefits**

- One board per user, a handful of columns, tens of cards: reading and writing the whole board is trivial.
- The board is always loaded and shown as a whole, and the AI receives and changes it as a whole.
- Card order and moves are just list edits in `cardIds`; no position columns to renumber.

**Costs**

- No SQL queries over individual cards.
- Concurrent edits are last-write-wins.

Neither cost matters for a single local user. If they ever do, `cards` can become its own table without changing the API.

## Behaviour

| When            | What happens |
|-----------------|--------------|
| Startup         | Create the file and tables if missing. Insert user `user` and its default board (five columns, eight demo cards) if absent. |
| Read            | `SELECT data FROM boards WHERE user_id = ?`, parsed into a validated model. |
| Write           | Apply the change to the parsed board in Python, re-validate it against the rules in `db-schema.json`, then save it in a single `UPDATE` that also sets `updated_at`. Invalid boards are never stored. |
| Multiple users  | Already supported: every query is scoped by the signed-in user's id. |
| Multiple boards | Future: drop `UNIQUE` on `boards.user_id` and add a `name` column. |

## Location

| Where  | Path |
|--------|------|
| Local  | env `DB_PATH`, default `backend/data/pm.db` (git-ignored) |
| Tests  | a temporary file per test |
| Docker | `/app/backend/data`, backed by the named volume `pm-data` |

The volume keeps the board across stop and start. Reset it with `docker volume rm pm-data`.
