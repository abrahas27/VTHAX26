// POST /api/items/batch : hydrate items by ID so the UI never renders LLM-written facts (10.6).
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, requireUser, settle } from "@/lib/api";
import { sql, T } from "@/lib/databricks/sql";
import { toClub, toEvent, type ClubRow, type EventRow } from "@/lib/dashboard";

export const runtime = "nodejs";

const ID_LIMIT = 60;
const ids = () =>
  z
    .array(z.string().regex(/^[A-Z]{2}\d{3,4}$/))
    .max(ID_LIMIT)
    .optional();

const BodySchema = z.object({
  events: ids(),
  clubs: ids(),
  companies: ids(),
  opportunities: ids(),
  courses: z.array(z.string().max(16)).max(ID_LIMIT).optional(),
});

/** IDs are validated by shape, then passed as a single ARRAY parameter (never interpolated). */
const inList = (column: string, table: string, cols: string) =>
  `SELECT ${cols} FROM ${T(table)} WHERE ${column} IN (SELECT explode(from_json(:ids, 'array<string>')))`;

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, BodySchema);
  if (!body.ok) return body.response;
  const { events, clubs, companies, opportunities, courses } = body.data;

  const [eventRows, clubRows, companyRows, oppRows, courseRows] = await Promise.all([
    settle(
      "events",
      events?.length
        ? sql<EventRow>(
            inList(
              "event_id",
              "gold_events_enriched",
              "event_id, title, event_type, start_ts, location, host_name, company_name, path_names, related_skills",
            ),
            { ids: JSON.stringify(events) },
          )
        : Promise.resolve([] as EventRow[]),
      [] as EventRow[],
    ),
    settle(
      "clubs",
      clubs?.length
        ? sql<ClubRow>(
            inList(
              "club_id",
              "clubs",
              "club_id, club_name, category, meeting_day, meeting_time, skills_developed, description, gobblerconnect_url, application_required",
            ),
            { ids: JSON.stringify(clubs) },
          )
        : Promise.resolve([] as ClubRow[]),
      [] as ClubRow[],
    ),
    settle(
      "companies",
      companies?.length
        ? sql(
            inList(
              "company_id",
              "companies",
              "company_id, company_name, industry, headquarters, career_paths, sponsors_visa",
            ),
            { ids: JSON.stringify(companies) },
          )
        : Promise.resolve([]),
      [] as Record<string, unknown>[],
    ),
    settle(
      "opportunities",
      opportunities?.length
        ? sql(
            inList(
              "opportunity_id",
              "opportunities",
              "opportunity_id, title, opportunity_type, company_name, path_id, required_skills, class_years, location, deadline, apply_url",
            ),
            { ids: JSON.stringify(opportunities) },
          )
        : Promise.resolve([]),
      [] as Record<string, unknown>[],
    ),
    settle(
      "courses",
      courses?.length
        ? sql(
            inList(
              "course_code",
              "courses",
              "course_code, course_title, skills_taught, offered_terms, department",
            ),
            {
              ids: JSON.stringify(courses),
            },
          )
        : Promise.resolve([]),
      [] as Record<string, unknown>[],
    ),
  ]);

  // Maps keyed by id, so the client can drop any id the catalog did not return.
  return NextResponse.json({
    events: Object.fromEntries(eventRows.value.map((r) => [r.event_id, toEvent(r)])),
    clubs: Object.fromEntries(clubRows.value.map((r) => [r.club_id, toClub(r)])),
    companies: Object.fromEntries(companyRows.value.map((r) => [String(r.company_id), r])),
    opportunities: Object.fromEntries(oppRows.value.map((r) => [String(r.opportunity_id), r])),
    courses: Object.fromEntries(courseRows.value.map((r) => [String(r.course_code), r])),
  });
}
