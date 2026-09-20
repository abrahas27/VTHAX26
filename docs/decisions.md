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

## 2026-09-19 (P3): The agent needs step headroom beyond the 6 tool calls

- **Decision:** `stopWhen: stepCountIs(8)` in `/api/chat`, keeping the spec's 6 tool steps but leaving room
  for the model to write its reply.
- **Why:** With a budget of exactly 6, every observed pivot run spent all six steps on tools and returned
  `finishReason: "tool-calls"` with **empty text** — the tab appeared but the student got no answer.

## 2026-09-19 (P3): Tool descriptions spell out exact section shapes

- **Decision:** `render_dashboard`'s description lists every section type with a literal JSON example, and
  the zod fields carry `.describe()` text.
- **Why:** The model's first call consistently guessed `"event"`, `"clubs"`, `"markdown"` instead of
  `event_list`, `club_grid`, `insight`. Zod rejected it, the model retried, and the wasted steps starved the
  final answer — one run produced no tab at all. With explicit examples: 4/4 runs, zero tool errors.

## 2026-09-19 (P3): The path catalog lives in the system prompt

- **Decision:** All 19 `CPxx` ids and names are listed in the system prompt.
- **Why:** The agent called `list_career_paths` on nearly every turn just to map "investment banking" to
  CP04, spending a step it needed for the answer.

## 2026-09-19 (P3): The output guard validates course codes too

- **Decision:** The `[ID]` pattern also matches course codes (`FIN 4114`), which `build_gap_roadmap` returns
  as roadmap item ids.
- **Why:** The agent cites courses the same way it cites events. Without this they bypassed the guard
  entirely, so an invented course number would have rendered as fact.

## 2026-09-19 (P3): One mapper per catalog table, shared by every reader

- **Decision:** `toEvent`, `toClub` and `toOpportunity` in `src/lib/dashboard.ts` are the only places a
  Unity Catalog row becomes a UI item. Both the dashboard fan-out and `/api/items/batch` go through them.
- **Why:** `/api/items/batch` returned raw opportunity rows (`opportunity_type`, `company_name`) while the
  cards read `type`/`companyName`, so `type` was `undefined` and the goal tab crashed the whole page with
  "Cannot read properties of undefined". The dashboard path had its own inline copy of the mapping and was
  fine, which is exactly how the two drifted. Label helpers now also tolerate a missing type, so one absent
  field degrades a single chip instead of the page.

## 2026-09-19 (P4): Search palette binds to "/", not Cmd/Ctrl+K

- **Decision:** `SearchCommand` (F10) opens on `/` when no input is focused. Cmd/Ctrl+K stays bound
  to focusing the chat panel (F5, decided in P3).
- **Why:** The spec asks for both a global Cmd/Ctrl+K search palette (F10) and a global Cmd/Ctrl+K
  chat focus (F5) — the same key for two different targets. Chat had it first and is a MUST feature;
  search is SHOULD. Rebinding one key to two behaviors (e.g. "open search if empty, else focus chat")
  would be surprising, so search gets its own key instead.

## 2026-09-19 (P4): `ics` needs no integration guide

- **Decision:** No `docs/integrations/ics.md`, matching the precedent set for `unpdf`/`mammoth`
  (spec 12.3, no separate guide either).
- **Why:** The 12.7 template is for external services with accounts, quotas, and failure modes to
  document. `ics` is a local npm library with no account, no network call, and no key — there is
  nothing in the template's sections that would not be empty.

## 2026-09-19 (P4): Vercel Cron ingestion fallback shipped alongside the Databricks notebook, not after failure

- **Decision:** `src/app/api/cron/ingest/route.ts`, `src/lib/ingest.ts`, and `vercel.json`'s `crons`
  entry exist now, not only if `02_ingest_external_apis.py` is later found to fail from Databricks
  serverless compute.
- **Why:** This session has no live Databricks workspace to test outbound egress against, so there
  is no way to observe the failure spec 11.9 warns about before it happens on stage. Building the
  documented fallback now — inert until `CRON_SECRET`/`ONET_KEY`/`BLS_KEY` are set — costs nothing
  and removes a blocking dependency on a live test.

## 2026-09-19 (P4): `agent_turns` Lakebase → Delta copy is not built

- **Decision:** `databricks/03_agent_eval.py` reads `{catalog}.{schema}.agent_turns` if it exists
  and folds it into a coarse grounding check, but nothing populates that Unity Catalog table yet.
  The golden-set evaluation (spec 15.3) runs standalone against live UC Functions + `ai_query` and
  does not depend on it.
- **Why:** Lakebase is a separate Postgres project; bridging it into Delta needs either a JDBC pull
  (minting short-lived Lakebase OAuth credentials the same way `src/lib/db/lakebase.ts` does, then
  `spark.read.jdbc(...)`) or an export endpoint on the app side. Writing either untested against a
  live workspace this session did not have credentials for was judged riskier than documenting the
  gap plainly — see `docs/integrations/mlflow-eval.md` — and building the golden-set eval to not
  depend on it. Revisit once a live workspace is available to verify the JDBC path.

## 2026-09-19 (P4): Job-board and Greenhouse/Lever tokens ship empty on purpose

- **Decision:** `BOARDS` in both `databricks/02_ingest_external_apis.py` and `src/lib/ingest.ts` is
  an empty map with a comment showing the shape.
- **Why:** Spec rule 3 ("never invent credentials, IDs, or URLs") extends to company board tokens —
  a guessed `boards.greenhouse.io/<token>` could be wrong for another company entirely. Only a human
  who has clicked through a real careers page and confirmed the token should add an entry.
