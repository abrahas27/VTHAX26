# DEMO_MODE and recorded fixtures

## Purpose in HireUp

The stage safety net (spec 14.4). With `DEMO_MODE=true` the dashboard serves payloads recorded from
real Databricks responses, so a cold warehouse, an exhausted quota, or bad conference wifi cannot
break the demo. It is also how the UI can be worked on without spending tokens.

## Cost / free tier limits

Free. Fixtures are JSON files in `fixtures/demo/`, committed to the repo.

## Human steps (do these in order)

1. With real credentials and a healthy warehouse, run `pnpm demo:record`.
2. Commit the refreshed `fixtures/demo/*.json`.
3. Rehearse once with `DEMO_MODE=true pnpm dev` (spec 14.4 asks for this before demo day).
4. Leave `DEMO_MODE=false` in production unless the live path is failing.

## Environment variables

| Name        | Example | Where used                      | Secret? |
| ----------- | ------- | ------------------------------- | ------- |
| `DEMO_MODE` | `false` | `lib/demo.ts`, `/api/dashboard` | no      |

## Code touchpoints

- `src/lib/demo.ts` — `isDemoMode()`, `readFixture()`, `demoDashboard()`.
- `src/app/api/dashboard/route.ts` — serves a fixture when DEMO_MODE is on, and also falls back to one
  if the live call throws; the response carries `demoMode: true` and the UI shows a banner.
- `scripts/record-demo-fixtures.mts` — records `for-you` and `CP04` for the "Pivoting Priya" profile.
- `scripts/register.mjs` + `scripts/loader.mjs` — let `node --experimental-strip-types` resolve `@/`
  imports and stub `server-only` outside Next.js.

## Verify

```bash
pnpm demo:record       # prints counts per tab
DEMO_MODE=true pnpm dev
```

Recorded 2026-09-19: for-you 25 events / 25 visits / 6 clubs / 25 opportunities; CP04 22 / 11 / 4 / 7.

## Failure modes and fallback

- Missing fixture: `demoDashboard()` returns null and the route falls through to the live path (or a
  502 if that fails too). Re-run `pnpm demo:record`.
- Stale fixtures: mock events span Aug 24 - Dec 11 2026, so re-record if the demo date moves outside it.

## Security notes

Fixtures hold catalog rows only (events, clubs, companies), never student data. The recorder uses a
hard-coded fictional profile.
