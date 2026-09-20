# Databricks Genie integration

## Purpose in HokiePath

Powers the "Ask the data" box on `/admin` (F11): Career Services types a natural-language question
and gets an answer plus a result table, backed by the gold aggregate tables (never per-student
rows). This is the Deloitte-consulting "insights product" angle from the challenge brief.

## Cost / free tier limits

Genie spaces are free to create on Free Edition. Each question round-trips through a SQL Warehouse
query, so the same warehouse cold-start latency applies (pre-warm before a demo, spec 14.3).

## Human steps (do these in order)

1. **Genie → New**. Add tables: `gold_path_supply_demand`, `gold_skill_gap_summary`,
   `gold_events_enriched`, `students`, `event_registrations`, `career_paths`.
2. Paste these instructions into the space: _"Students and registrations are synthetic. Always
   aggregate; never list individual students. A pivoting student has is_pivoting = true.
   Attendance rate = attended / (attended + no_show)."_
3. Seed it with the sample questions from `01_setup_hokiepath_lakehouse.py`'s last markdown cell
   (also shown as suggested prompts in `GenieBox`) and test each one in the Genie UI first.
4. Copy the space id from the URL (`.../genie/rooms/<space_id>`) into `DATABRICKS_GENIE_SPACE_ID`.

## Environment variables

| Name                        | Example                             | Where used                    | Secret? |
| --------------------------- | ----------------------------------- | ----------------------------- | ------- |
| `DATABRICKS_GENIE_SPACE_ID` | `01ef...` (from the Genie room URL) | `src/lib/databricks/genie.ts` | no      |

## Code touchpoints

- `src/lib/databricks/genie.ts` — `askGenie(question, conversationId?)`: starts or continues a
  conversation, polls the message (~30 s max) until it reaches a terminal status, then fetches the
  query-result table for any query attachment. Reads every response field defensively and logs the
  raw JSON on an unexpected shape, since field names have moved across Genie API versions.
- `src/app/api/admin/genie/route.ts` — `POST /api/admin/genie`, admin-only (enforced by
  `src/proxy.ts`).
- `src/components/admin/genie-box.tsx` — the question box, sample prompts, and result table.

## Verify

```bash
curl -s -X POST localhost:3000/api/admin/genie \
  -H "Content-Type: application/json" -H "Cookie: <admin session cookie>" \
  -d '{"question":"Which career paths have the most students per upcoming event?"}'
```

Expect `text` plus a `columns`/`rows` table within 30 s.

## Failure modes and fallback

- `DATABRICKS_GENIE_SPACE_ID` unset → `POST /api/admin/genie` returns `not_configured` (503); the
  rest of `/admin` (KPI cards, chart, gap table) still renders from `/api/admin/metrics`.
- Genie times out or returns a non-`COMPLETED` status → `askGenie` logs the raw message and returns
  whatever `text`/table it did get (often empty); the UI shows "No answer came back. Try
  rephrasing." rather than throwing.
- Spec 14.4 fallback: pre-computed charts (the KPI cards, bar chart, gap table) plus canned answers
  for the sample questions if Genie itself is unavailable during a demo.

## Security notes

Admin-only: `/admin` and `/api/admin/*` require `session.isAdmin` (an `ADMIN_EMAILS` account),
enforced in `src/proxy.ts` before the route runs. Genie instructions explicitly forbid listing
individual students; `students`/`event_registrations` are synthetic hackathon data.
