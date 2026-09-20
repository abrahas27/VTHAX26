# Decisions (short ADRs)

Format: date, decision, why, consequences. Newest at the bottom.

## 2026-09-19: Adopt the spec stack (Next.js on Vercel + Databricks Free Edition)

- **Decision:** Build per `HokiePath_Spec.pdf` v1.0. The early Python stubs (`app.py`, `agents.py`, `database.py`) moved to `legacy/python-prototype/` and are excluded from lint and typecheck.
- **Why:** The spec's agent, streaming, and hosting design all assume TypeScript Route Handlers + the Vercel AI SDK.

## 2026-09-19: Next.js 16 renames `middleware.ts` to `proxy.ts`

- **Decision:** Route protection (spec 7.2 / F1 `middleware.ts`) lives in `src/proxy.ts` and exports `proxy`.
- **Why:** In Next 16 the `middleware` convention is deprecated (see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). Proxy runs on the Node.js runtime by default; do not set `runtime` in it.

## 2026-09-19: shadcn/ui uses Base UI primitives (style `base-nova`), not Radix

- **Decision:** Keep the current shadcn default (`@base-ui/react`, class merging via shadcn's `cn` package).
- **Why:** It is what `shadcn init` installs today; the components are still owned in `src/components/ui/`. Component APIs differ slightly from Radix-era examples, so check the generated file before using props.

## 2026-09-19: Seed CSVs live in `databricks/data/`

- **Decision:** Follow the spec 7.2 layout. `01_setup_hokiepath_lakehouse.py` now looks for `./data` (next to the notebook) and falls back to `../data`. `generate_mock_data.py` sits in `databricks/` so it writes to the same folder.

## 2026-09-19: Lakebase schema: team's edited version is canonical

- **Decision:** `lakebase/01_app_schema.sql` is the root-level copy the team edited (adds `student_profiles.skill_evidence JSONB`), not the seed-package copy. `02_migrations.sql` adds spec 8.3 plus `event_prep.talking_points` (F9 returns talking points).

## 2026-09-19: `env.ts` is lazy and DEMO_MODE-aware

- **Decision:** `env` parses `process.env` on first property access (not on import) and only requires Databricks/Lakebase variables when `DEMO_MODE` is not `true`. Blank values (`KEY=`) count as unset.
- **Why:** Lets `next build`, tests, and a DEMO_MODE rehearsal run without live secrets while still failing fast, with every missing key listed, the first time real config is used.

## 2026-09-19 (P1): Later-phase services are validated where they are used

- **Decision:** The env schema only requires `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, `DATABRICKS_WAREHOUSE_ID`
  when `DEMO_MODE` is off. Lakebase, model serving, Vector Search and Genie are checked by `requireEnv(...)`
  inside their own client modules, and `lakebaseConfigured()` lets routes degrade.
- **Why:** P1 shipped before Lakebase existed. A global schema would have made sign-in and the dashboard fail
  over an unrelated missing key.

## 2026-09-19 (P1): shadcn Button composes with `render`, not `asChild`

- **Decision:** Link-styled buttons use `<Button nativeButton={false} render={<Link href="..." />} />`.
- **Why:** The installed shadcn Button wraps Base UI's Button, which has no `asChild` prop.

## 2026-09-19 (P1): JWT claims are narrowed at the point of use

- **Decision:** `src/types/next-auth.d.ts` augments only `Session`. The `jwt`/`session` callbacks narrow
  `token.userId` and `token.isAdmin` explicitly.
- **Why:** The `JWT` interface lives in `@auth/core`, which is not a direct dependency, so
  `declare module "@auth/core/jwt"` does not merge and silently types claims as `unknown`.

## 2026-09-19 (P1): Sign-in tolerates a missing Lakebase

- **Decision:** The `jwt` callback wraps `upsertUser` in try/catch and `/start` falls back to `/onboarding`
  when there is no `userId`.
- **Why:** Google sign-in can be demoed and tested before spec 11.8 is done. Revisit once Lakebase is live:
  per-user routes should fail loudly rather than silently losing state.

## 2026-09-19 (P1): Lakebase is a Postgres _project_, so credentials come from the postgres API

- **Decision:** `lakebase.ts` calls `POST /api/2.0/postgres/credentials` with
  `{"endpoint": "projects/<project_id>/branches/<branch_id>/endpoints/<endpoint_id>"}` and caches the
  returned `token` until 5 minutes before `expire_time`. `LAKEBASE_INSTANCE` is replaced by
  `LAKEBASE_ENDPOINT`. `LAKEBASE_PASSWORD` remains an override that skips generation entirely.
- **Why:** The workspace uses an autoscaling Lakebase project, not a provisioned database instance. The
  instance-era call (`/api/2.0/database/credentials` with `instance_names`) fails with
  `Database instance 'hokiepath-db' not found`.
- **Gotchas:** the API addresses projects by **name** (`hokiepath-db`), not by UID; the response field is
  `expire_time`; credentials last ~60 minutes. This project has `enable_pg_native_login: false`, so option
  (b) is unavailable until native login is turned on.

## 2026-09-19 (P2): Normalize reasoning-model responses in the LLM client

- **Decision:** `src/lib/databricks/llm.ts` wraps `fetch` and rewrites chat completions so `content` is
  always a string, dropping `reasoning` blocks, for both JSON and SSE responses.
- **Why:** `databricks-gpt-oss-120b` returns content as typed blocks, which the OpenAI-compatible provider
  cannot parse; without this, answers come back empty. Reasoning is scratchpad text and must never be shown
  or stored as an answer. Verified with live tests against both gpt-oss and Llama 4 Maverick.

## 2026-09-19 (P2): Model-supplied goal names go through resolvePath()

- **Decision:** `resolvePath()` maps any free-text goal ("IB", "investment-banking", "CP04") onto a real
  career path before it reaches a UC Function.
- **Why:** The functions filter on exact path names. gpt-oss guessed `"investment-banking"` in the tool-call
  smoke test, which returns 0 rows where `"investment banking"` returns 12 — a silent, plausible-looking
  empty dashboard, which is exactly the failure the grounding rule exists to prevent.

## 2026-09-19 (P2): Class year is computed, not prompted

- **Decision:** The model reports `expected_graduation` verbatim; `classYearFrom()` derives the standing.
- **Why:** Asked to infer standing, the model put a May 2029 graduate in the wrong year twice (Freshman,
  then Junior, where Sophomore is right). Date arithmetic is deterministic and belongs in tested code.

## 2026-09-19 (P2): Catalog reads use a per-instance TTL cache

- **Decision:** `src/lib/catalog.ts` caches paths, skills, majors, and path_skills for 10 minutes in module
  state, de-duplicating concurrent loads, instead of Next's `unstable_cache`.
- **Why:** Simple, predictable, and works identically in Route Handlers, scripts, and tests. Catalog data
  changes at most daily.

## 2026-09-19 (P2): Fixture resumes are generated, not binary blobs

- **Decision:** `pnpm fixtures:resumes` writes the three PDFs from text in `scripts/make-fixture-resumes.mts`.
- **Why:** Keeps the repo diffable and lets anyone tweak a resume to re-test extraction. The students are
  fictional.
