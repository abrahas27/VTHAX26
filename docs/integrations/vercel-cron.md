# Vercel Cron ingestion fallback

## Purpose in HokiePath

Spec 14.4 / 11.9's documented fallback for one specific risk: **Free Edition serverless compute may
restrict outbound internet access**, which would make `databricks/02_ingest_external_apis.py`'s
calls to O*NET, BLS, Greenhouse, and Lever fail from inside the workspace even though the
credentials are correct. If that happens, the same three ingestions run from Vercel's network
instead, writing to the same Unity Catalog tables through the SQL Statement API.

**Use the Databricks notebook first.** This route exists so one blocked feature (workspace egress)
never stalls the rest of P4 — it is not a replacement for the notebook path, which is simpler to
run, re-run, and combine with the gold refresh in one Job.

**Status (2026-09-20): not needed, left unconfigured on purpose.** Databricks serverless compute in
this workspace has confirmed outbound access to GitHub, Greenhouse, and BLS — the egress risk this
route hedges against did not materialize. `CRON_SECRET` is deliberately left blank, so
`GET /api/cron/ingest` 500s on any request; that is this route's own way of staying disabled. The
code stays in the repo (kept in parity with the notebook's `BOARDS`/id/path-matching logic) as cheap
insurance in case a workspace or tier change reintroduces the restriction — see `docs/decisions.md`.

## Cost / free tier limits

Vercel Cron on the Hobby plan runs at most once a day per cron entry; `vercel.json` schedules
`GET /api/cron/ingest` at `0 10 * * *` (10:00 UTC — 06:00 America/New_York during EDT, 05:00 during
EST; Vercel Cron schedules are UTC and do not shift for daylight saving).

## Human steps (do these in order)

1. Only set this up if `databricks/02_ingest_external_apis.py` actually fails with connection/DNS
   errors (not 4xx from the APIs themselves) when run on serverless compute.
2. Generate a random secret (`openssl rand -base64 32`) and set it as `CRON_SECRET` in Vercel
   (Production). Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on Cron Job
   requests, which is exactly what `GET /api/cron/ingest` checks.
3. If O*NET/BLS ingestion needs to run from here too, also set `ONET_KEY` / `BLS_KEY` as Vercel env
   vars (see `docs/integrations/onet.md`, `bls.md`) — these are separate from the Databricks secret
   scope, since Vercel and Databricks are different networks with different secret stores.
4. Redeploy (or the next scheduled run picks up `vercel.json`'s `crons` entry automatically).
5. After a run, check `SELECT source, count(*) FROM workspace.hokiepath.bronze_job_postings GROUP
BY source` and `onet_occupation_skills` / `bls_wages` row counts to confirm rows landed.
6. Manually rerun `01_setup_hokiepath_lakehouse.py` (gold refresh) afterward — this route does not
   rebuild gold tables itself, to avoid two ingestion paths racing to rewrite the same gold SQL.

## Environment variables

| Name          | Example                | Where used                         | Secret? |
| ------------- | ---------------------- | ---------------------------------- | ------- |
| `CRON_SECRET` | random 32+ char string | `src/app/api/cron/ingest/route.ts` | yes     |
| `ONET_KEY`    | see `onet.md`          | `src/lib/ingest.ts`                | yes     |
| `BLS_KEY`     | see `bls.md`           | `src/lib/ingest.ts`                | yes     |

## Code touchpoints

- `vercel.json` — the `crons` entry.
- `src/app/api/cron/ingest/route.ts` — checks the `Authorization: Bearer <CRON_SECRET>` header,
  then calls `runIngestion()`. Listed in `src/proxy.ts`'s public-API allowlist (no user session
  exists for a cron request; this route is its own gate).
- `src/lib/ingest.ts` — `runIngestion()` runs O*NET, BLS, and job-board ingestion in parallel, each
  independently skipped (not failed) if its key/config is missing, and returns a summary with a
  per-section `errors[]` array.

## Verify

```bash
curl -s localhost:3000/api/cron/ingest -H "Authorization: Bearer $CRON_SECRET"
# => {"onetRows":..,"blsRows":..,"postingRows":..,"errors":[...]}
```

A non-empty `errors` array is expected whenever a key is intentionally unset (e.g. `BOARDS` empty)
— read the messages before assuming a real failure.

## Failure modes and fallback

- Wrong or missing `CRON_SECRET` → `401 unauthorized`, logged plainly; no partial writes happen.
- An individual section's fetch fails (bad key, upstream 5xx) → that section's row count is 0 and
  its message lands in `errors`; the other sections still ran (spec 14.3: partial failure degrades
  one section, not the whole job).
- If Databricks serverless egress turns out to work fine after all, this route is simply never
  scheduled to matter — the notebook path stays authoritative and this stays documented but idle.

## Security notes

`CRON_SECRET` is the only thing standing between this route and anyone who finds the URL; it is
compared with `===` against the `Authorization` header (constant-time comparison is not warranted
for a low-value, rotatable secret guarding a data-refresh job, not an auth boundary). `ONET_KEY` /
`BLS_KEY` never reach the browser (`src/lib/ingest.ts` starts with `import "server-only"`).
