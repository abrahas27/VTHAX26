# O*NET Web Services integration

## Purpose in HokiePath

Free U.S. Department of Labor occupational data. Links each career path's `onet_soc_code` to
official skill importances and descriptions, enriching `get_path_outlook` and goal-tab headers with
real data instead of only mock figures (spec 12.4, F6).

## Cost / free tier limits

Free registration, no published rate limit for reasonable use. O*NET has changed API versions and
auth schemes over time — **verify the current developer docs before relying on this in a demo**;
the notebook and route below print the raw error per SOC code rather than failing silently, so a
version mismatch is easy to spot.

## Human steps (do these in order)

1. Register at O*NET Web Services (free): https://services.onetcenter.org/ → request API access.
2. Store the key in the Databricks secret scope: `databricks secrets create-scope hokiepath` (once),
   then `databricks secrets put-secret hokiepath onet_key` (paste the key when prompted).
3. Run `databricks/02_ingest_external_apis.py` on serverless compute. Section 1 reads
   `dbutils.secrets.get("hokiepath", "onet_key")` and writes `onet_occupation_skills`.
4. Rerun `01_setup_hokiepath_lakehouse.py` (gold refresh) so `get_path_outlook` and the goal-tab
   header pick up the enrichment.

**Only if Databricks serverless cannot reach the internet** (spec 11.9 watch-out): set `ONET_KEY`
as a Vercel environment variable instead, and `GET /api/cron/ingest` (protected by `CRON_SECRET`)
will call O*NET from Vercel's network and write the same table via the SQL Statement API. See
`docs/integrations/vercel-cron.md`.

## Environment variables

| Name       | Example                                            | Where used                              | Secret? |
| ---------- | -------------------------------------------------- | --------------------------------------- | ------- |
| `onet_key` | (Databricks secret scope `hokiepath`, normal path) | `databricks/02_ingest_external_apis.py` | yes     |
| `ONET_KEY` | (Vercel env var, cron fallback only)               | `src/lib/ingest.ts`                     | yes     |

## Code touchpoints

- `databricks/02_ingest_external_apis.py` §1 — fetches `.../occupations/{soc}/summary/skills` per
  distinct `career_paths.onet_soc_code`, writes `onet_occupation_skills(soc_code, element_name,
importance, description)`.
- `src/lib/ingest.ts` — `ingestOnet()`, the Vercel Cron fallback equivalent; `CREATE TABLE IF NOT
EXISTS` keeps the schema in sync with the notebook.

## Verify

```sql
SELECT count(*) FROM workspace.hokiepath.onet_occupation_skills; -- > 0
```

## Failure modes and fallback

- Missing `onet_key` secret → the notebook section prints "Skipping O*NET" and moves on; nothing
  else in the app depends on this table being populated (median salary falls back to the mock
  `career_paths.median_salary_usd_mock`).
- A request error per SOC code is caught and printed; other SOC codes still get fetched.
- No internet egress from Databricks serverless → use the Vercel Cron fallback above.

## Security notes

The key never appears in application code or Vercel logs beyond the Authorization header; the
Databricks-side path keeps it entirely inside the `hokiepath` secret scope, never as a plain env var.
