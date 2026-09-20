// GET /api/calendar : .ics export for one or more events (spec F10).
import { z } from "zod";
import { apiError, parseQuery, requireUser } from "@/lib/api";
import { sql, T } from "@/lib/databricks/sql";
import { toEvent, type EventRow } from "@/lib/dashboard";
import { buildIcs } from "@/lib/ics";

export const runtime = "nodejs";

const QuerySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()))
    .pipe(
      z
        .array(z.string().regex(/^EV\d{3,4}$/))
        .min(1)
        .max(60),
    ),
});

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = parseQuery(req.url, QuerySchema);
  if (!parsed.ok) return parsed.response;
  const { ids } = parsed.data;

  const rows = await sql<EventRow>(
    `SELECT event_id, title, event_type, start_ts, location, host_name, company_name, path_names, related_skills
       FROM ${T("gold_events_enriched")}
      WHERE event_id IN (SELECT explode(from_json(:ids, 'array<string>')))`,
    { ids: JSON.stringify(ids) },
  );

  const baseUrl = new URL(req.url).origin;
  const result = buildIcs(rows.map(toEvent), baseUrl);
  if (!result.ok) return apiError("bad_request", result.message);

  return new Response(result.value, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="hokiepath-${ids.length > 1 ? "events" : ids[0]}.ics"`,
    },
  });
}
