# Lakebase (managed Postgres) integration

## Purpose in HireUp

Per-user application state that changes on every click: `app_users`, `student_profiles`, chat history,
AI-created goal tabs (`dashboard_state`), `saved_items`, `roadmap_items`, `event_prep`, `readiness_snapshots`
and the `agent_turns` trace log (spec 11.8). Delta/Unity Catalog stays the analytical source of truth; F1-F9
read and write here.

## Status

**Not provisioned yet (as of 2026-09-19).** `/api/health` reports `lakebase: false` and sign-in works without
it; `upsertUser` is skipped and the session carries no `userId`. Finish the human steps before P2.

## Cost / free tier limits

Free Edition has a Lakebase quota; use the smallest capacity. Instances may be paused when idle.

## Human steps (do these in order)

1. Databricks → **Compute → Lakebase** → create a Postgres **project** named `hireup-db` (done).
2. Open its SQL editor (or connect with `psql`) and run `lakebase/01_app_schema.sql`, then
   `lakebase/02_migrations.sql`, in that order.
3. From **Connection details**, copy the endpoint host, database name (`databricks_postgres`) and user into
   `LAKEBASE_HOST`, `LAKEBASE_DB`, `LAKEBASE_USER`.
4. Set `LAKEBASE_ENDPOINT` to the endpoint's resource name. Discover it with the API:
   ```bash
   curl -s -H "Authorization: Bearer $DATABRICKS_TOKEN" "$DATABRICKS_HOST/api/2.0/postgres/projects"
   curl -s -H "Authorization: Bearer $DATABRICKS_TOKEN" \
     "$DATABRICKS_HOST/api/2.0/postgres/projects/<project_id>/branches"
   curl -s -H "Authorization: Bearer $DATABRICKS_TOKEN" \
     "$DATABRICKS_HOST/api/2.0/postgres/projects/<project_id>/branches/<branch_id>/endpoints"
   ```
   Note that `project_id` is the **name** (`hireup-db`), not the UID. For this workspace the value is
   `projects/hireup-db/branches/production/endpoints/primary`.
5. Auth method: leave `LAKEBASE_PASSWORD` empty and the app mints a ~60-minute credential per endpoint
   (option a). Only set `LAKEBASE_PASSWORD` if the project has native Postgres login enabled and you created
   a role (option b); this project currently reports `enable_pg_native_login: false`. When set, it is used
   as-is and no credential is generated.
6. Optional: create synced tables from `gold_events_enriched`, `companies`, `career_paths` for low-latency
   catalog reads.

## Environment variables

| Name                | Example                                                          | Where used            | Secret? |
| ------------------- | ---------------------------------------------------------------- | --------------------- | ------- |
| `LAKEBASE_HOST`     | `ep-blue-heart-d8wg3pum.database.us-east-2.cloud.databricks.com` | `lakebase.ts` pool    | no      |
| `LAKEBASE_DB`       | `databricks_postgres`                                            | `lakebase.ts` pool    | no      |
| `LAKEBASE_USER`     | `sam.abrahas1@gmail.com` (Databricks identity)                   | `lakebase.ts` pool    | no      |
| `LAKEBASE_ENDPOINT` | `projects/hireup-db/branches/production/endpoints/primary`       | credential generation | no      |
| `LAKEBASE_PASSWORD` | native role password                                             | `lakebase.ts` pool    | yes     |

## Code touchpoints

- `src/lib/db/lakebase.ts` — module-level `Pool` (max 3, SSL), async password provider that calls
  `POST /api/2.0/postgres/credentials` with `{"endpoint": "<resource name>"}` and caches the returned
  `token` until 5 minutes before `expire_time`, `normalizeEndpoint()`, `q()` (sets `search_path` to `app`),
  `lakebaseConfigured()`, `lakebaseReachable()`. Test: `tests/unit/lakebase-endpoint.test.ts`.
- `src/lib/db/queries.ts` — `upsertUser` (called from the Auth.js `jwt` callback on first sign-in),
  `getUserByEmail`, `hasCompletedOnboarding`.
- `src/app/api/health/route.ts` reports reachability; `src/app/start/page.tsx` degrades to `/onboarding`.

## Verify

- `SELECT count(*) FROM app.app_users;` works in the Lakebase SQL editor.
- `/api/health` reports `lakebase: true`.
- Sign in, then confirm a new row in `app.app_users` with `last_login_at` set.

## Failure modes and fallback

- `Lakebase needs LAKEBASE_HOST, ...` — step 3 is unfinished.
- `Database instance 'x' not found` — the old instance-style API was used against a project. Use
  `POST /api/2.0/postgres/credentials` with an endpoint resource name.
- `Project with name 'projects/<uid>' not found` — a UID was used where the project **name** belongs.
- `LAKEBASE_ENDPOINT must look like projects/...` — the value is not a full endpoint resource name.
- 401/403 from the credentials call — `DATABRICKS_TOKEN` expired, or the identity lacks access to the project.
- Connection timeouts under load: serverless opens many short connections; keep `max` small and consider the
  Lakebase connection pooler endpoint if offered.
- If Lakebase is unavailable or over quota, point the same code at a free Neon Postgres (identical SQL) and
  say so honestly; Delta stays on Databricks (spec 14.4).

## Security notes

`lakebase.ts` is `server-only`; credentials never reach the browser. Queries use `$1` placeholders only.
Generated credentials live in memory for at most an hour and are refreshed 5 minutes before expiry. Every route scopes rows to the session's `userId`.
