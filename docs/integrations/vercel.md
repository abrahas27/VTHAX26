# Vercel (hosting) integration

## Purpose in HireUp

Hosts the Next.js app: RSC pages, `/api/*` Route Handlers, the agent loop, and preview deployments per
branch (spec 12.2). The judge-facing URL.

## Status

**Not deployed yet (as of 2026-09-19).** Local dev is verified; the first deploy is the remaining P1 step.

## Cost / free tier limits

Hobby is free. Function execution time is limited by plan and settings, so chat, resume, and Genie routes set
`export const maxDuration = 60` and bound their tool steps.

## Human steps (do these in order)

1. Create a Vercel account with GitHub. **Add New → Project → Import** the HireUp repo. Framework preset
   Next.js (root directory is the repo root; build `pnpm build`).
2. **Settings → Environment Variables**: add every filled-in key from `.env.local` for Production _and_
   Preview (see the list below).
3. **Settings → Functions**: set the region closest to the Databricks workspace region to cut latency.
4. Deploy, then copy the production URL into the Google OAuth client (origins + redirect URI) — see
   `google-oauth.md`.
5. Optional later: **Cron Jobs** via `vercel.json` if ingestion falls back to Vercel (spec 11.9).

## Environment variables

Paste the same names as `.env.example`. Required for a working P1 deploy:
`AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `DATABRICKS_HOST`, `DATABRICKS_TOKEN`,
`DATABRICKS_WAREHOUSE_ID`, `DATABRICKS_CATALOG`, `DATABRICKS_SCHEMA`, `LAKEBASE_HOST`, `LAKEBASE_DB`,
`LAKEBASE_USER`, `LAKEBASE_ENDPOINT`, plus optional `ALLOWED_EMAIL_DOMAINS`, `ADMIN_EMAILS`, `DEMO_MODE`.
LLM, Vector Search, and Genie keys are added as those phases land.

## Code touchpoints

`next.config.ts`; `src/proxy.ts` (runs as Vercel middleware/proxy); every Route Handler sets
`runtime = "nodejs"` because Databricks and `pg` need Node APIs.

## Verify

- Production URL loads the landing page and Continue with Google works.
- `https://<app>.vercel.app/api/health` returns `ok: true` with `warehouse: "RUNNING"`.

## Failure modes and fallback

- Build fails on missing env: `src/lib/env.ts` only validates on first use, so the build itself does not need
  secrets; a route returning 500 with "Invalid environment configuration" means a key is missing in Vercel.
- `redirect_uri_mismatch` after deploy: the Vercel URL is not in the Google client.
- Function timeout: lower tool steps, or pre-warm the warehouse.

## Security notes

Environment variables are encrypted at rest and only exposed to server code; only `NEXT_PUBLIC_*` reaches the
browser. Preview deployments share Preview env values, so treat preview URLs as sensitive.
