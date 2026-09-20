@AGENTS.md

# HokiePath: project brief for Claude Code

Living summary of `HokiePath_Spec.pdf` (v1.0). The spec is the source of truth; this file records how we are applying it.
Update the **Current phase** and **Fallbacks in use** sections at the end of every phase.

## Current phase

**P1 Foundations: code complete (2026-09-19).** Design tokens, landing page (F1), Auth.js + Google with
`src/proxy.ts` route protection, `sql.ts` / `functions.ts`, `lakebase.ts` + `upsertUser`, and `GET /api/health`.
Verified locally: warehouse `RUNNING` (280 events, all six UC Functions), protected pages redirect, protected
APIs return 401.

Lakebase is now live (project `hokiepath-db`, branch `production`, endpoint `primary`; both SQL files applied;
`/api/health` reports `lakebase: true`). The app is still **not deployed to Vercel** (12.2). `DATABRICKS_LLM_ENDPOINT` is also still empty; it is needed from P2 (11.5).

Next: **P2 Profile + dashboard** (F2 resume upload + extraction, F3 questionnaire + `scoring.ts`,
F4 For You dashboard, `/api/dashboard`, `/api/items/batch`, DEMO_MODE fixtures).

## What we're building

A student signs in with Google, uploads a resume (parsed by a Databricks-hosted LLM), and answers an 8-question
questionnaire. HokiePath then builds a skill profile and a **For You** dashboard: events, recruiter visits, clubs,
opportunities, and a Gap-to-Goal roadmap, all ranked by how well they close skill gaps. A tool-using chat agent answers
career questions and **opens goal tabs** (the "morphing dashboard", F6). Career Services get an aggregate Admin Insights
page backed by Genie.

Features: F1 sign-in, F2 resume parsing, F3 questionnaire + fit, F4 dashboard, F5 chat, F6 goal tabs, F7 roadmap
(all MUST); F8 Recruiter Radar, F9 Event Prep, F10 semantic search + .ics, F11 Admin/Genie (SHOULD); F12 compare (MAY).

## Architecture

```
Browser (Next.js UI) --HTTPS--> Vercel: pages (RSC) + /api/* Route Handlers + agent loop (AI SDK)
                                  |-- SQL Statement Execution API --> SQL Warehouse --> Unity Catalog (workspace.hokiepath)
                                  |                                     Delta tables + 6 UC Functions (agent tools)
                                  |-- /serving-endpoints (OpenAI-compatible) --> Foundation Model APIs (LLM, embeddings)
                                  |-- Vector Search REST, Genie Conversation API
                                  `-- pg over TLS --> Lakebase Postgres (schema app): per-user state
```

- **Unity Catalog / Delta** = shared catalog + analytics (events, clubs, companies, visits, opportunities, gold tables).
  Built by `databricks/01_setup_hokiepath_lakehouse.py`. Mock events span **Aug 24 - Dec 11, 2026**; tools filter on
  `current_date()`.
- **Lakebase** = an autoscaling Postgres **project** (not a database instance): credentials come from
  `POST /api/2.0/postgres/credentials` with an endpoint resource name. Per-user app state: `app_users`, `student_profiles`, `chat_sessions`, `chat_messages`,
  `dashboard_state`, `saved_items`, `roadmap_items`, `event_prep`, `readiness_snapshots`, `agent_turns`.
- **UC Functions** (agent tools; `student_skills` is a comma-separated canonical skill list; `''` means "any"):
  `list_career_paths()`, `get_skill_gap(target_path, student_skills)`,
  `build_gap_roadmap(target_path, student_skills, days_ahead)`, `find_events(target_path, major, days_ahead)`,
  `companies_visiting(target_path, days_ahead)`, `find_opportunities(target_path, opp_type)`.
  Call with named params: `SELECT * FROM workspace.hokiepath.find_events(:target_path, :major, :days_ahead)`.
- **Agent** (`/api/chat`): AI SDK + `@ai-sdk/openai-compatible` pointed at `${DATABRICKS_HOST}/serving-endpoints`,
  max 6 tool steps, temperature 0.3. The `render_dashboard` tool emits a `DashboardSpec` (spec 10.6) that contains
  **IDs only**; the server validates the IDs against UC, and the client hydrates them via `POST /api/items/batch`.
- Path IDs are `CP01`..`CP19` (e.g. CP01 Software Engineering). Item IDs: `EV####` events, `RV####` visits,
  `OP####` opportunities, `CL###` clubs, `CO###` companies, `SK###` skills.

## Non-negotiable rules (spec 1.1)

1. Work phase by phase (below). Don't start a phase until `pnpm lint`, `pnpm typecheck`, `pnpm test` and the phase's
   manual check pass.
2. **Never invent credentials, IDs, hosts, endpoint names, or URLs.** Stop and ask, pointing at the spec step.
3. Secrets only in `.env.local` and Vercel env vars. Keep `.env.example` complete (every Section 13 var, blank values).
4. **All Databricks and Lakebase calls are server-side.** Those modules start with `import "server-only"`. No token
   reaches the browser. Only `NEXT_PUBLIC_*` vars may be read client-side.
5. **Ground everything in data:** the agent and UI show only events/clubs/companies/opportunities returned by a tool
   call, referenced by ID. The output guard strips unknown `[ID]` chips.
6. Every external service gets `docs/integrations/<service>.md` from `docs/integrations/_TEMPLATE.md`. Print its
   _Human steps_ in the terminal when the human needs to act.
7. If a Databricks feature is blocked by Free Edition quotas, use the Section 14.4 fallback and record it below.
8. Verify against live/installed docs where the spec says _verify_ (Databricks APIs, Auth.js, AI SDK option names).
   For Next.js, read `node_modules/next/dist/docs/` first (see AGENTS.md).

## Conventions

- TypeScript strict + `noUncheckedIndexedAccess`. Path alias `@/*` -> `src/*`.
- Route Handlers: `export const runtime = "nodejs"`; `maxDuration = 60` on chat, resume, and Genie. Call `auth()` first
  (401 if missing; admin routes also require `isAdmin`). Validate every input and every LLM output with **zod**.
  Errors are `{ error: { code, message } }`.
- SQL: named parameters only (Statement API `parameters`, pg `$1`). Identifiers come from env or a fixed allow-list.
- Config: import `env` from `@/lib/env` and never read `process.env` directly for server config. `env` is parsed
  lazily; Databricks/Lakebase vars are only required when `DEMO_MODE` is not `true`.
- UI: shadcn/ui components in `src/components/ui/` (Base UI primitives, `base-nova` style; check the generated
  component's props rather than assuming Radix APIs). Icons: `lucide-react`. Motion: `motion` (Framer Motion).
  Charts: Recharts. Dark-first design tokens (spec 5.1) as CSS variables in `src/app/globals.css` (P1).
- Deterministic scoring lives in `src/lib/scoring.ts` with unit tests (spec 10.7).
- Tests: Vitest in `tests/unit/` (node env; `server-only` is stubbed). Live Databricks tests are opt-in via
  `RUN_LIVE=1`. Playwright smoke in `tests/e2e/` (P5).
- Prettier (100 cols, tailwind plugin) + ESLint (next core-web-vitals + TS + prettier). `_`-prefixed vars may be unused.
- Record non-obvious choices in `docs/decisions.md`.

## Commands

| Command                             | Does                                                                |
| ----------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                          | Dev server on :3000                                                 |
| `pnpm build` / `pnpm start`         | Production build / serve                                            |
| `pnpm lint`                         | ESLint                                                              |
| `pnpm typecheck`                    | `next typegen` (route types like `LayoutProps`) then `tsc --noEmit` |
| `pnpm test` / `pnpm test:watch`     | Vitest                                                              |
| `pnpm format` / `pnpm format:check` | Prettier                                                            |
| `pnpm demo:record`                  | (P2) record DEMO_MODE fixtures from live responses                  |

Health check: `curl localhost:3000/api/health` (add `?warm=1` to start a cold warehouse before a demo).

## Repo layout

```
CLAUDE.md  AGENTS.md  README.md  .env.example
docs/integrations/      one guide per service (_TEMPLATE.md)
docs/decisions.md       short ADRs
databricks/             01_setup_hokiepath_lakehouse.py, generate_mock_data.py, data/*.csv (13 CSVs)
                        02_ingest_external_apis.py, 03_agent_eval.py (P4)
lakebase/               01_app_schema.sql, 02_migrations.sql (run in order)
fixtures/resumes/       cs.pdf, finance.pdf, me.pdf (P2)
fixtures/demo/          DEMO_MODE JSON (P2)
src/app/                pages: /, /onboarding, /dashboard, /roadmap, /saved, /profile, /admin, /unauthorized
src/app/api/            health, resume, profile, onboarding, catalog, dashboard, items/batch, chat, tabs,
                        roadmap(/[id]), saved, prep, search, calendar, admin/metrics, admin/genie, me, auth/[...nextauth]
src/components/         ui/ (shadcn), dashboard/, chat/, onboarding/, admin/
src/lib/                env.ts, auth.ts, types.ts, scoring.ts, skills-normalize.ts, ics.ts, demo.ts
src/lib/databricks/     sql.ts, functions.ts, llm.ts, vector.ts, genie.ts
src/lib/db/             lakebase.ts, queries.ts
src/lib/agent/          system-prompt.ts, tools.ts, dashboard-spec.ts
src/proxy.ts            route protection (Next 16 name for middleware.ts)
tests/unit, tests/e2e
legacy/python-prototype superseded stubs, excluded from build
```

## Environment variables (spec 13; see `.env.example`)

| Var                                                         | Secret | Notes                                                            |
| ----------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`       | yes    | Auth.js v5 + Google (12.1)                                       |
| `ALLOWED_EMAIL_DOMAINS`                                     | no     | empty = any Google account; `vt.edu` to restrict                 |
| `ADMIN_EMAILS`                                              | no     | comma-separated; gates `/admin`                                  |
| `DATABRICKS_HOST`                                           | no     | workspace URL, no trailing slash                                 |
| `DATABRICKS_TOKEN`                                          | yes    | PAT (11.4); also mints Lakebase creds and calls Genie            |
| `DATABRICKS_WAREHOUSE_ID`                                   | no     | SQL Warehouse connection details                                 |
| `DATABRICKS_CATALOG` / `DATABRICKS_SCHEMA`                  | no     | `workspace` / `hokiepath`                                        |
| `DATABRICKS_LLM_ENDPOINT` / `DATABRICKS_EMBEDDING_ENDPOINT` | no     | from the Serving page; never hard-code                           |
| `DATABRICKS_VS_EVENTS_INDEX` / `DATABRICKS_VS_OPPS_INDEX`   | no     | optional; ILIKE fallback                                         |
| `DATABRICKS_GENIE_SPACE_ID`                                 | no     | optional                                                         |
| `LAKEBASE_HOST` / `LAKEBASE_DB` / `LAKEBASE_USER`           | no     | Lakebase connection details                                      |
| `LAKEBASE_ENDPOINT`                                         | no     | `projects/<p>/branches/<b>/endpoints/<e>`; credential generation |
| `LAKEBASE_PASSWORD`                                         | yes    | native Postgres role (option b)                                  |
| `NEXT_PUBLIC_AIBI_DASHBOARD_URL`                            | no     | link on /admin                                                   |
| `DEMO_MODE`                                                 | no     | `true` serves `fixtures/demo/*.json`                             |
| `CRON_SECRET`                                               | yes    | Vercel Cron ingestion fallback                                   |
| secret scope `hokiepath`: `onet_key`, `bls_key`             | yes    | Databricks-side, not env vars                                    |

## Phase plan (spec 16.2)

| Phase                  | Deliverables                                                                                                            | Exit check                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| P0 Setup               | Accounts; scaffold; `.env.example`; CLAUDE.md; seed notebook run                                                        | Seed tables + functions visible; `pnpm dev` runs |
| P1 Foundations         | Tokens + shadcn; landing; Auth.js Google; env.ts; sql.ts, functions.ts, lakebase.ts; `/api/health`; first Vercel deploy | Prod sign-in works; health green                 |
| P2 Profile + dashboard | Resume upload + extraction; review; questionnaire; scoring.ts; `/api/dashboard`; For You tab; drawers; DEMO_MODE        | Fixture resume -> populated dashboard            |
| P3 Agent + morphing UI | Chat panel; tools; render_dashboard; persisted goal tabs; roadmap page; Recruiter Radar                                 | Pivot question creates IB tab; reload persists   |
| P4 Databricks depth    | Vector Search + `/api/search`; Event Prep; .ics; Genie admin; AI/BI link; ingestion job or cron                         | 11.13 checks pass or fallback documented         |
| P5 Polish + eval       | Motion, states, mobile; MLflow eval; golden set; pre-warm                                                               | QA script 15.2 passes twice                      |
| P6 Ship                | Final deploy; deck; rehearsals incl. DEMO_MODE; backup video                                                            | Demo < 5 min                                     |

Cut order if behind: F12 -> AI/BI link -> real ingestion -> MLflow eval -> Vector Search -> Event Prep.
Never cut: sign-in, resume parsing, dashboard, chat, pivot tab, roadmap.

## Known pitfalls

- **Next.js 16:** `middleware.ts` became `src/proxy.ts` (export `proxy`, Node runtime, no `runtime` config).
  `LayoutProps`/`PageProps` are generated by `next typegen`.
- **zod 4** is installed (`z.url()`, `z.email()` are top-level; `error` replaces `message`/`errorMap` in some APIs).
- **AI SDK** option names differ by major version (`inputSchema` vs `parameters`, `stopWhen: stepCountIs(6)` vs
  `maxSteps`). Check the installed version.
- Statement API `JSON_ARRAY` returns every value as a string; arrays/structs arrive as JSON text (coerce by
  `manifest.schema.columns[].type_name`). A cold warehouse needs polling; pre-warm before demos.
- Free Edition quotas on serving, Vector Search, Lakebase, and serverless egress (ingestion may need the Vercel Cron fallback).

## Fallbacks in use

None yet. Model serving is not configured; it is guarded by `requireEnv` rather than the global env schema,
so unrelated routes keep working until P2 lands.
