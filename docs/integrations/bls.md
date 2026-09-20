# BLS Public Data API integration

## Purpose in HireUp

Official median wages by occupation (OEWS), replacing the mock `career_paths.median_salary_usd_mock`
in goal-tab headers where a real national series exists (spec 12.6, F6).

## Cost / free tier limits

Free registration; the registered-key tier allows batches of up to 50 series ids per request and a
higher daily query limit than the unregistered tier. Not every SOC code publishes a national median
wage — some fall back to mock data, and that's expected, not a bug.

## Human steps (do these in order)

1. Register for a free BLS API v2 key: https://www.bls.gov/developers/.
2. Store it in the Databricks secret scope: `databricks secrets put-secret hireup bls_key`.
3. **Confirm the OEWS national-median series id pattern for your SOC codes** with the BLS series ID
   formatter on their site before running this in a demo — the pattern has shifted between OEWS
   vintages, and a stale pattern silently returns zero rows for every code.
4. Run `databricks/02_ingest_external_apis.py` §2, then rerun the gold refresh.

**Only if Databricks serverless cannot reach the internet:** set `BLS_KEY` as a Vercel environment
variable; `GET /api/cron/ingest` will pull the same data from Vercel's network (see
`docs/integrations/vercel-cron.md`).

## Environment variables

| Name      | Example                                            | Where used                              | Secret? |
| --------- | -------------------------------------------------- | --------------------------------------- | ------- |
| `bls_key` | (Databricks secret scope `hokiepath`, normal path) | `databricks/02_ingest_external_apis.py` | yes     |
| `BLS_KEY` | (Vercel env var, cron fallback only)               | `src/lib/ingest.ts`                     | yes     |

## Code touchpoints

- `databricks/02_ingest_external_apis.py` §2 — builds a `soc -> series id` map, POSTs to
  `/publicAPI/v2/timeseries/data/` in batches, writes `bls_wages(soc_code, year,
median_annual_wage)` from the latest year returned.
- `src/lib/ingest.ts` — `ingestBls()`, the Vercel Cron fallback equivalent.

## Verify

```sql
SELECT * FROM workspace.hokiepath.bls_wages ORDER BY year DESC LIMIT 10;
```

Expect at least one row; a goal tab whose path resolved a wage shows "Median pay $X (BLS OEWS,
YEAR)" instead of "(mock)" once the app reads this table (P4 wires the read path in
`get_path_outlook`; see `src/lib/agent/tools.ts`).

## Failure modes and fallback

- Missing `bls_key` → the section is skipped and prints why.
- A SOC code with no published national-median series returns no data for that code only; the mock
  salary stays the fallback for it (spec 12.6, explicitly allowed).
- No internet egress from Databricks serverless → use the Vercel Cron fallback above.

## Security notes

`bls_key` stays server-side in both paths (Databricks secret scope, or a Vercel env var read only
by `src/lib/ingest.ts`, which starts with `import "server-only"`).
