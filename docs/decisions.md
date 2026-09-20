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
- **Superseded 2026-09-20:** see the entry below — three tokens are now populated after being
  verified live, not guessed.

## 2026-09-20 (P4): Databricks serverless egress confirmed; Vercel Cron fallback stays built but unused

- **Decision:** `databricks/02_ingest_external_apis.py` remains the only ingestion path actually
  run. `src/app/api/cron/ingest/route.ts`, `src/lib/ingest.ts`, and `vercel.json`'s `crons` entry
  stay in the repo (kept in parity with the notebook, see below) but `CRON_SECRET` is deliberately
  left unset, so the route 500s on any request — this is the route's own way of being "off."
- **Why:** GitHub, Greenhouse, and BLS are all reachable from Databricks serverless compute in this
  workspace, confirmed live — the egress restriction spec 11.9/14.4 warns about did not materialize.
  The fallback is cheap insurance to keep around (a workspace/tier change could reintroduce the
  restriction) but wiring it up now would just be a second, redundant ingestion path to keep in
  sync for no live benefit.

## 2026-09-20 (P4): Verified Greenhouse board tokens for three existing companies

- **Decision:** `BOARDS` now maps `CO002` (Databricks) → `databricks`, `CO019` (Jane Street) →
  `janestreet`, `CO009` (Boston Consulting Group) → `bcg`, in both
  `databricks/02_ingest_external_apis.py` and `src/lib/ingest.ts`.
- **Why:** Each token was confirmed live against `boards-api.greenhouse.io` (2026-09-20), returning
  a real, non-empty `jobs` array, for a company that already has a matching row in our `companies`
  table. Other plausible-looking tokens (`stripe`, `airbnb`, `robinhood`, `coinbase`, `figma`, and
  others) also resolved live but were **not** added, since none of those companies exist in our mock
  `companies` table and inventing one was out of scope here.

## 2026-09-20 (P4): Stable `opportunity_id` via MD5, upserted with `MERGE INTO`

- **Decision:** `stable_opportunity_id`/`stableOpportunityId` now hash `f"{source}:{job_id}"` with
  MD5 (not Python's/JS's non-cryptographic default) and truncate to a 5-digit `OPX#####` id. The
  Databricks notebook writes via `MERGE INTO {fq}.opportunities ... WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *` instead of `append`.
- **Why:** Python's built-in `hash()` is randomized per process (`PYTHONHASHSEED`), so the previous
  version minted a new id for the same posting on every notebook run and, under `append` writes,
  duplicated every previously-ingested opportunity on each scheduled re-run. MD5 (a stable,
  non-cryptographic-use hash here — collision resistance is not the concern) gives a deterministic
  id, and `MERGE` makes re-running the notebook idempotent regardless. `src/lib/ingest.ts` uses the
  same MD5 scheme so the two ingestion paths can never disagree on an id for the same posting; it
  keeps its simpler check-then-insert dedup (true `MERGE` was judged not worth the added complexity
  for a route that is currently unused — see the egress decision above).

## 2026-09-20 (P4): A `NULL` opportunity deadline means "still open," not "expired"

- **Decision:** `find_opportunities` (UC function), `gold_path_supply_demand`'s `open_opportunities`
  count, and `src/lib/search.ts`'s ILIKE fallback all changed `deadline >= current_date()` to
  `(deadline IS NULL OR deadline >= current_date())`. Ingested postings write `deadline = NULL`
  rather than a guessed date.
- **Why:** Greenhouse/Lever postings don't expose an application deadline, and fabricating one (e.g.
  "today + 60 days, labeled estimated") would show a student a specific date HokiePath does not
  actually know to be true — the opportunities table has no column to carry an "estimated" flag, so
  the label would only ever exist in a code comment, not in what the student sees. Treating unknown
  as open is honest about what we know and avoids a real posting silently vanishing from the app
  after an arbitrary guessed date passes.

## 2026-09-20 (P4): `guess_path_id` broadened to all 19 career paths; unmatched postings are skipped

- **Decision:** `PATH_RULES` (both the notebook and `src/lib/ingest.ts`) now covers all 19
  `career_paths` rows with an ordered list — engineering-discipline and other specific rules first,
  CP01's generic `"engineer"` keyword last as a catch-all. A posting that still matches no path is
  not inserted into `opportunities` at all.
- **Why:** The original 4-path ruleset (CP01/CP02/CP04/CP07) meant most real postings had
  `path_id = NULL`. `gold_opportunity_search_docs` inner-joins `opportunities` to `career_paths` on
  `path_id`, so a NULL-path row is invisible in search and in `find_opportunities` regardless —
  inserting it anyway was dead data, so skipping it (and logging a count) is more honest than
  silently keeping a permanently-invisible row.

## 2026-09-20 (P4): `01_setup_hokiepath_lakehouse.py` preserves ingested opportunities across reruns

- **Decision:** The bronze→silver loop special-cases `opportunities`: before overwriting it from the
  mock CSV, it snapshots `WHERE source <> 'mock'` into a throwaway table, then unions those rows back
  into the freshly-typed CSV load before the final overwrite write.
- **Why:** The loop unconditionally does `df.write.mode("overwrite")...saveAsTable(f"{fq}.{name}")`
  for every table on every run, which would silently erase every real Greenhouse/Lever posting
  `02_ingest_external_apis.py` had merged in. The snapshot goes through a separate physical table
  rather than an in-memory reference because overwriting a table from a DataFrame that still reads
  that same table is undefined behavior in Spark ("cannot overwrite a table that is also being read
  from").

## 2026-09-20 (P5): Measure first — a step-level bench, not a stopwatch on the page

- **Decision:** `tests/integration/bench-live.test.ts` (opt-in via `RUN_LIVE=1 BENCH=1`) times every
  external call the hot routes make — each UC Function, each catalog read, Lakebase credential +
  connect + query, Vector Search, the LLM's time-to-first-token, and a whole agent turn — and prints
  a table. Route totals are read off `Server-Timing` and the structured logs `withTiming` already
  emits.
- **Why:** The routes need a Google session, so a black-box timing pass over `/api/*` would have
  measured almost nothing without a browser in the loop. Timing the steps instead attributes the
  cost: it showed that every Statement Execution API call has a ~500-900 ms floor even for
  `SELECT 1`, which reframes the whole problem as "make fewer calls", not "make the calls faster".

## 2026-09-20 (P5): `/api/dashboard?sections=core|roadmap` — the slowest UC Function stops gating first paint

- **Decision:** `buildDashboard` takes a `sections` option. The client fires `core` and `roadmap` as
  two parallel requests; the cards render from `core`, and the roadmap section shows a shaped
  skeleton until its own request lands. Both For You and the agent-built goal tabs do this.
- **Why:** Measured warm, `build_gap_roadmap` is 1.8-2.5 s against 0.5-0.9 s for the other five
  calls, so the six-way `Promise.all` finished at 2.5-2.8 s while the five-way finishes at ~1.6 s.
  Every card on the page was waiting for the one section a student reads last. The second request
  costs an extra `auth()` and a profile read, both of which are now cached per warm instance.
- **Alternative considered:** converting the dashboard to RSC with per-section Suspense boundaries,
  which the spec's wording suggests. Rejected for now: the tab switching, optimistic writes and
  hover prefetch all live in TanStack Query on the client, and moving the fetch to the server would
  have meant rebuilding that for a smaller win than the split itself delivers.

## 2026-09-20 (P5): `reasoning_effort: "low"` on every model call

- **Decision:** `LOW_REASONING` in `src/lib/databricks/llm.ts`, passed as `providerOptions` from the
  agent, resume extraction and Event Prep. `@ai-sdk/openai-compatible` merges provider options whose
  key matches the provider name straight into the request body, so this reaches the endpoint as a
  top-level `reasoning_effort`.
- **Why:** `databricks-gpt-oss-120b` is a reasoning model and defaults to a high budget. Measured
  against this workspace on the same pivot prompt: 4.1 s / 10.1 s and 1,617 / 4,304 characters of
  hidden reasoning at the default, against 2.1 s / 2.2 s and 77 / 30 characters at `"low"` — for an
  answer of the same length. The agent makes two or three of these round trips per turn.
- **Why it is safe here:** every judgement that has to be right — readiness, class year, ranking, fit
  — is arithmetic done in TypeScript, not reasoned about by the model (spec 10.7). The live agent
  goldens (1, 2, 3, 8 and the tab-reuse check) all pass at `"low"`, with the output guard finding no
  ungrounded IDs.

## 2026-09-20 (P5): `plan_for_path` — one tool call per pivot question, and it opens the tab itself

- **Decision:** A composite agent tool that runs `get_skill_gap`, `find_events`,
  `companies_visiting`, `find_opportunities`, `build_gap_roadmap` and the clubs query in one
  `Promise.all`, returns them as one column-narrowed result, and saves a default `DashboardSpec`
  built from the IDs it just fetched. The system prompt tells the agent not to call
  `render_dashboard` afterwards; the narrow tools and `render_dashboard` both remain, for narrower
  questions and for rearranging a tab.
- **Why:** The spec's five-tool sequence was five agent steps — five model round trips as well as
  five warehouse queries — and `render_dashboard` added a sixth whose output is a large JSON spec
  that is expensive to generate. A pivot turn went from 5-6 tool calls and ~11 s to 1 tool call and
  5.5 s.
- **Why the auto-opened tab is still grounded:** every ID in it came out of a UC Function moments
  earlier in the same turn, and the spec still goes through `DashboardSpecSchema`. The `verifyIds`
  round trip that `render_dashboard` does is deliberately skipped for this path — there is nothing
  to confirm about an ID the warehouse just handed us — while a model-written spec still gets it.
- **Consequence:** `tests/integration/agent-live.test.ts` golden 1 now asserts the tab, not the old
  tool names.

## 2026-09-20 (P5): `preferredRegion` is deprecated in Next 16; the region is pinned in `vercel.json`

- **Decision:** `"regions": ["iad1"]` in `vercel.json`. The `export const preferredRegion` route
  segment config was added first and then removed — `next build` warns that it is deprecated, and
  `node_modules/next/dist/docs/.../preferredRegion.md` says to remove the export.
- **Why:** Lakebase and the Databricks workspace are both in AWS `us-east-2`; `iad1` is the closest
  Vercel region. Left on the default, a function can run several hundred milliseconds of round trip
  away from data it queries five or six times per request.

## 2026-09-20 (P5): Caches are per-instance and TTL'd, not shared

- **Decision:** `src/lib/cache.ts` (`ttlCache`, with request coalescing) backs the catalog (30 min),
  the student profile (60 s), the goal-tab layout (60 s) and the dashboard payload (60 s). Every
  write that changes what a dashboard would show clears the relevant entries.
- **Why:** These live in the module scope of one warm serverless instance, so a miss is only ever a
  slow response, never a wrong one, and a cold instance simply re-fetches. That is enough for a demo
  and for Free Edition quota, and it avoids standing up a shared cache for state that is already
  authoritative in Lakebase and Unity Catalog.
- **Note:** `unstable_cache` was not used. It keys on the function's arguments and is invalidated by
  tag, which would have meant threading tags through modules that are also called by scripts and
  tests outside a Next.js request context.

## 2026-09-20 (P5): Lakebase `search_path` moves to the connection, and roadmap sync to one statement

- **Decision:** The pool passes `options: "-c search_path=app,public"` rather than issuing
  `SET search_path` per query, and `syncRoadmapItems` does its delete/update/insert in a single
  statement with three CTEs over `jsonb_to_recordset`.
- **Why:** `q()` was two round trips instead of one, on every Lakebase query in the app; and a
  30-item roadmap cost 61 sequential round trips to us-east-2. Verified live that the connection
  option takes: `SHOW search_path` returns `app,public`, and `SELECT ... FROM app_users` resolves
  with no per-query `SET`.
- **Alternative considered:** issuing the `SET` from the pool's `connect` handler. It works, but it
  overlaps the caller's first query on the same client, which node-postgres deprecates (it warns
  that this is removed in pg@9).
