# HireUp

AI career co-pilot for Virginia Tech students (VTHacks, Deloitte x Databricks challenge, _Campus Career Navigator_ track).
A student uploads a resume, answers 8 questions, and gets a living dashboard of VT events, clubs, recruiter visits, and a
Gap-to-Goal roadmap; the chat agent can open new goal tabs ("How can I pivot into investment banking?").

Next.js (App Router) on Vercel in front of Databricks Free Edition (Unity Catalog, SQL Warehouse, UC Functions,
Foundation Model APIs, Vector Search, Lakebase, Genie, Jobs, MLflow). The full build spec is `HokiePath_Spec.pdf`;
the working summary for contributors and Claude Code is [CLAUDE.md](CLAUDE.md).

## Quick start

```bash
pnpm install
cp .env.example .env.local   # fill in values; see docs/integrations/
pnpm dev                     # http://localhost:3000
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`.

## Layout

| Path                 | What                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `src/`               | Next.js app: pages, `/api/*` Route Handlers, components, `lib/` clients                   |
| `databricks/`        | Lakehouse setup notebook, mock-data generator, seed CSVs ([README](databricks/README.md)) |
| `lakebase/`          | Postgres schema + migrations for per-user app state                                       |
| `docs/integrations/` | One setup guide per external service                                                      |
| `docs/decisions.md`  | Short ADRs                                                                                |
| `fixtures/`          | Sample resumes and DEMO_MODE JSON                                                         |
| `legacy/`            | Superseded Python prototype (reference only)                                              |
