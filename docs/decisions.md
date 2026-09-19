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
