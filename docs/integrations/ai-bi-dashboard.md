# Databricks AI/BI Dashboard integration

## Purpose in HokiePath

Spec F11 / 11.11: an optional, polished Databricks-native dashboard for Career Services, linked from
`/admin`, for deeper exploration than the in-app KPI cards and chart cover. Purely a link — no data
flows through the Next.js app for this one.

## Cost / free tier limits

Free on Free Edition. No app-side cost since it is a static link the judge opens in a separate,
signed-in Databricks tab.

## Human steps (do these in order)

1. **Dashboards → Create dashboard** in the Databricks workspace.
2. Datasets: `gold_path_supply_demand`, `gold_skill_gap_summary`, `gold_events_enriched`.
3. Widgets (spec 11.11): a bar chart `students_per_upcoming_event by path_name`; a table of top
   missing skills; a counter for pivoting students; a bar chart of attendance rate by
   `recommended_by_agent` (from `event_registrations`, joined to `events`/`gold_events_enriched`).
4. **Publish**, copy the shareable link.
5. Set `NEXT_PUBLIC_AIBI_DASHBOARD_URL` to that link (Vercel + `.env.local`). Being a `NEXT_PUBLIC_*`
   var, it is safe to expose client-side — it is just a URL, not a credential; the linked dashboard
   itself is only visible to someone signed in to the Databricks workspace.

## Environment variables

| Name                             | Example                                                 | Where used               | Secret? |
| -------------------------------- | ------------------------------------------------------- | ------------------------ | ------- |
| `NEXT_PUBLIC_AIBI_DASHBOARD_URL` | `https://dbc-....cloud.databricks.com/dashboardsv3/...` | `src/app/admin/page.tsx` | no      |

## Code touchpoints

- `src/app/admin/page.tsx` — reads `env.NEXT_PUBLIC_AIBI_DASHBOARD_URL` server-side and passes it as
  a prop to `AdminView`, rather than having the client component read `process.env` itself, keeping
  the one server-only `env` import point spec 1.1 asks for.
- `src/components/admin/admin-view.tsx` — renders "Open the AI/BI dashboard" in the page header when
  the URL is set; the link is entirely optional and the rest of `/admin` works without it.

## Verify

Open `/admin` while signed in as an `ADMIN_EMAILS` account; the link appears top-right and opens the
published dashboard in a new tab.

## Failure modes and fallback

- `NEXT_PUBLIC_AIBI_DASHBOARD_URL` unset → the link is simply not rendered (spec 11.0 marks this
  service MAY / cut-list item 2); `/admin`'s KPI cards, chart, and Genie box are unaffected.
- If the dashboard itself is unpublished or deleted, the link 404s inside Databricks — nothing to
  fix on the app side; just update or unset the env var.

## Security notes

Judges/viewers need their own Databricks workspace access to see the dashboard; the URL alone
grants nothing. No app data is duplicated into the dashboard — it queries the same gold tables live.
