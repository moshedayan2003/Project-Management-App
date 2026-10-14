# Project Management MVP Web App

## Business requirements

A project management app with these features:

- A user can sign in.
- When signed in, the user sees a Kanban board representing their project.
- The Kanban board has fixed columns that can be renamed.
- Cards on the board can be moved with drag and drop, and edited.
- An AI chat sidebar can create, edit and move one or more cards.

## Limitations (MVP)

- Sign in is hardcoded to `user` / `password`, but the database supports multiple users for the future.
- One Kanban board per signed-in user.
- Runs locally, in a Docker container.

## Technical decisions

| Area | Decision |
|------|----------|
| Frontend | Next.js |
| Backend | Python FastAPI, which also serves the static Next.js site at `/` |
| Packaging | Everything in one Docker container |
| Python packages | `uv`, also inside the Docker container |
| AI | OpenRouter, key `OPENROUTER_API_KEY` in `.env` in the project root |
| AI model | `nvidia/nemotron-3-ultra-550b-a55b:free` |
| Database | SQLite, local file, created if it does not exist |
| Scripts | Start and stop scripts for Mac, PC and Linux in `scripts/` |

## Starting point

A working frontend-only demo was already in `frontend/`. It was not yet designed for the Docker setup.

## Color scheme

| Name | Hex | Use |
|------|-----|-----|
| Accent Yellow | `#ecad0a` | Accent lines, highlights |
| Blue Primary | `#209dd7` | Links, key sections |
| Purple Secondary | `#753991` | Submit buttons, important actions |
| Dark Navy | `#032147` | Main headings |
| Gray Text | `#888888` | Supporting text, labels |

## Coding standards

1. Use the latest versions of libraries and idiomatic approaches as of today.
2. Keep it simple. NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features.
3. Be concise. Keep the README minimal. IMPORTANT: no emojis, ever.
4. When hitting issues, always identify the root cause before trying a fix. Do not guess. Prove it with evidence, then fix the root cause.

## Working documentation

All planning and execution documents live in `docs/`. Review `docs/PLAN.md` before proceeding.
