# Kanban Studio (frontend)

Next.js static site, served by the FastAPI backend at `/`.

## Run

The full app (this site plus the backend) runs with `scripts/start.sh` or `scripts/start.ps1` from the project root.

`npm run dev` starts only the Next.js dev server. It has no backend, so `/api/*` calls fail; use it only for layout work.

```bash
npm install
npm run dev
```

## Test

```bash
npm run test:unit
npm run test:e2e   # builds the site and starts the backend with uv; needs uv on PATH
npm run lint
```

See [AGENTS.md](AGENTS.md) for the code layout.
