# Greenhouse & Lever public job boards integration

## Purpose in HokiePath

Many employers publish postings through public, keyless JSON endpoints. Pulling a few real
internships next to the mock `opportunities` rows makes the demo feel live (spec 12.5, F6).

## Cost / free tier limits

Free, no key, no published rate limit for reasonable (daily) polling — but these are public
consumer endpoints, not a documented partner API, so fetch at most once a day and never hammer a
board.

## Human steps (do these in order)

1. For each company HokiePath tracks, open its real careers page. Only add it if the page links to
   `boards.greenhouse.io/<token>` or `jobs.lever.co/<token>` — **verify by clicking through**, never
   guess a token.
2. Add `company_id -> (source, token)` to the `BOARDS` dict:
   - Databricks side: `databricks/02_ingest_external_apis.py` §3.
   - Vercel Cron fallback: `BOARDS` in `src/lib/ingest.ts`.
3. Run the ingestion (notebook or `GET /api/cron/ingest`), then rerun the gold refresh so any
   student-role postings that were auto-mapped into `opportunities` show up in the app.

`BOARDS` ships empty in both places. Nothing is fetched, and no company is guessed, until a human
fills it in with verified tokens.

## Environment variables

None — these endpoints are keyless. `CRON_SECRET` protects the Vercel Cron route that calls them
(see `docs/integrations/vercel-cron.md`), not the boards themselves.

## Code touchpoints

- `databricks/02_ingest_external_apis.py` §3 — fetches `boards-api.greenhouse.io/v1/boards/<token>/jobs`
  or `api.lever.co/v0/postings/<token>`, writes `bronze_job_postings`, then keyword-maps titles
  containing "intern", "summer analyst", "new grad", "co-op", "university" into `opportunities`
  (path guessed by a keyword rule; unmapped rows get `path_id = NULL`, which the fallback logic in
  `find_opportunities` treats as "no path filter match" — i.e. it still needs a human or `ai_query`
  pass to assign a path for those to surface path-specific).
- `src/lib/ingest.ts` — `ingestJobBoards()`, the Vercel Cron fallback. Writes only
  `bronze_job_postings`; mapping into `opportunities` stays a Databricks-side gold-refresh step so a
  quickly-written array insert from Node never risks corrupting the live `opportunities` table.

## Verify

```sql
SELECT source, count(*) FROM workspace.hokiepath.bronze_job_postings GROUP BY source; -- > 0 once BOARDS is filled in
SELECT source, count(*) FROM workspace.hokiepath.opportunities GROUP BY source; -- mock + a real source
```

## Failure modes and fallback

- `BOARDS` empty → both paths print "Skipping" and no rows are written; the app is unaffected
  (mock `opportunities` are the whole catalog, same as before P4).
- A board 404s or times out → that company's fetch is skipped and logged; other companies still run.
- No internet egress from Databricks serverless → use `GET /api/cron/ingest` instead.

## Security notes

No credentials involved. `bronze_job_postings.raw` stores the full JSON response for traceability;
it contains only public posting data, nothing about HokiePath users.
