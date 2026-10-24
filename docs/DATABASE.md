# Database

**Status:** implemented in `backend/app/db.py` (storage) and `backend/app/models/board.py` (board model and rules). Version 2 (Part 11): user accounts with passwords and several boards per user.
**Schema file:** [db-schema.json](db-schema.json) (machine-readable).

## Summary

One SQLite file, created automatically on startup if it does not exist. Each board is stored as a single JSON document. A user can have any number of boards.

## Tables

| Table    | Columns |
|----------|---------|
| `users`  | `id`, `username` (unique), `password_hash` (scrypt, see below) |
| `boards` | `id`, `user_id` (foreign key to `users`, deleting a user deletes their boards), `name`, `data` (JSON text), `created_at`, `updated_at` |

Index: `boards_by_user` on `boards(user_id)`.

## Passwords

`app/services/passwords.py`, standard library only. A hash is stored as `scrypt$<cost>$<salt hex>$<hash hex>`: a random 16-byte salt per password and the scrypt work factor it was made with (2^14 by default), so the factor can change later without breaking stored passwords. Checks use a constant-time compare.

## Board JSON (`boards.data`)

Same shape as the frontend `BoardData` type:

```json
{
  "columns": [{ "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"] }],
  "cards": {
    "card-1": {
      "id": "card-1", "title": "...", "details": "...",
      "priority": "high", "due_date": "2026-11-01", "labels": ["ux"]
    }
  }
}
```

- `priority` is `low`, `medium`, `high` or null; `due_date` is `YYYY-MM-DD` or null; `labels` is a list of 1 to 24 character strings.
- Cards saved before these fields existed have none of them; they load with the defaults (null, null, `[]`), so no data migration was needed.

This shape is used everywhere: in the database, over the API, and to and from the AI. There is no conversion layer.

## Why one JSON document per board instead of card tables

**Benefits**

- A board has a handful of columns and tens of cards: reading and writing the whole board is trivial.
- The board is always loaded and shown as a whole, and the AI receives and changes it as a whole.
- Card order and moves are just list edits in `cardIds`; no position columns to renumber.

**Costs**

- No SQL queries over individual cards (the board list counts cards with `json_each`).
- Writes are serialized by one lock in the app (`UserBoard.update`).

Neither cost matters for a local app with a few users. If they ever do, `cards` can become its own table without changing the API.

## Behaviour

| When            | What happens |
|-----------------|--------------|
| Startup         | Create the file and tables if missing. Upgrade a version 1 database (see below). Make sure the demo user `user` / `password` exists; if it is missing it is created with one board, "My board", holding the eight demo cards. |
| Register        | Insert the user with a password hash and one empty board, "My board". A taken username is rejected. |
| Read            | `SELECT data FROM boards WHERE id = ? AND user_id = ?`, parsed into a validated model. Every board query includes the signed-in user's id, so another user's board looks the same as a missing one (404). |
| Write           | Apply the change to the parsed board in Python, re-validate it against the rules in `db-schema.json`, then save it in a single `UPDATE` that also sets `updated_at`. Invalid boards are never stored. |
| Delete account  | Deletes the user row; `ON DELETE CASCADE` removes their boards. |

## Upgrading a version 1 database

Version 1 (Parts 5 to 10) had `UNIQUE` on `boards.user_id`, no board name, and no stored password (the login was hardcoded). SQLite cannot drop a constraint, so `init_db` rebuilds the table when `boards` has no `name` column: rename it, create the new table, copy every row as "My board" (keeping its id, with `created_at` set to the old `updated_at`), drop the old one. The rebuild runs in one explicit transaction (Python's `sqlite3` does not open one for `ALTER` or `CREATE`), so a failure leaves the old table untouched. Afterwards the demo user gets the hash of `password` if it has none. Existing Docker volumes upgrade on their first start.

## Location

| Where  | Path |
|--------|------|
| Local  | env `DB_PATH`, default `backend/data/pm.db` (git-ignored) |
| Tests  | a temporary file per test |
| Docker | `/app/backend/data`, backed by the named volume `pm-data` |

The volume keeps the data across stop and start. Reset it with `docker volume rm pm-data`.
