// src/lib/agent/tools.ts : the agent's tools (spec 10.3). Each one is a Unity Catalog function,
// except render_dashboard (which writes a validated spec to Lakebase) and semantic_search (P4).
import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { careerPaths, pathById, resolvePath } from "@/lib/catalog";
import { ucFn } from "@/lib/databricks/functions";
import { sql, T } from "@/lib/databricks/sql";
import { getDashboardLayout, saveDashboardLayout } from "@/lib/db/queries";
import { search } from "@/lib/search";
import {
  collectIds,
  DashboardSpecSchema,
  pruneUnknownIds,
  upsertTab,
  type DashboardSpec,
} from "./dashboard-spec";
import type { SkillProfile } from "@/lib/types";

/** Trim tool output so prompts stay small (spec 10.3: max 25 rows, only needed columns). */
const MAX_ROWS = 25;
const trim = <T>(rows: T[]) => rows.slice(0, MAX_ROWS);

/**
 * Keep only the named columns. Every row a tool returns is re-read by the model on every later
 * step of the turn, so a wide row is paid for several times over in both latency and tokens.
 */
const pick = <K extends string>(
  rows: Record<string, unknown>[],
  keys: readonly K[],
  limit: number,
) =>
  rows
    .slice(0, limit)
    .map((row) => Object.fromEntries(keys.filter((k) => row[k] != null).map((k) => [k, row[k]])));

export interface ToolContext {
  profile: SkillProfile;
  /** Collects every id returned to the model this turn, for the output guard (spec 10.8). */
  seenIds: Set<string>;
  /** Specs saved this turn, so the route can tell the client which tab to open. */
  renderedTabs: DashboardSpec[];
}

const remember = (ctx: ToolContext, rows: Record<string, unknown>[], key: string) => {
  for (const row of rows) {
    const id = row[key];
    if (typeof id === "string") ctx.seenIds.add(id);
  }
  return rows;
};

/**
 * Resolve a model-supplied goal onto a real career path. The UC Functions filter on the exact
 * path name, so an unresolved guess silently returns zero rows (see docs/integrations/databricks-fmapi.md).
 */
async function targetPathName(input: string | undefined): Promise<string> {
  if (!input?.trim()) return "";
  const path = await resolvePath(input);
  return path?.path_name ?? input;
}

export function buildTools(ctx: ToolContext) {
  // Skills come from the stored profile, never from model arguments (spec 10.3).
  const studentSkills = ctx.profile.skills.map((s) => s.name).join(", ");

  return {
    plan_for_path: tool({
      description:
        "EVERYTHING about one career path in a single call: the student's skill gaps, upcoming " +
        "events, companies visiting campus, open opportunities, matching clubs, and an ordered " +
        "gap-closing roadmap. Use this for any question about a goal, a path or a pivot. It " +
        "replaces calling get_skill_gap, find_events, companies_visiting, find_opportunities, " +
        "find_clubs and build_gap_roadmap one after another, and leaves you far more of your " +
        "tool budget for the answer. target_path is a path name or a CPxx id.",
      inputSchema: z.object({
        target_path: z.string(),
        days_ahead: z.number().int().min(1).max(180).default(60),
      }),
      execute: async ({ target_path, days_ahead }) => {
        const path = await resolvePath(target_path);
        if (!path) {
          return {
            error: `No career path matches "${target_path}". Pick one from the list above.`,
          };
        }
        const name = path.path_name;

        // Six warehouse queries that do not depend on each other. In series they were six agent
        // steps -- six model round trips as well as six queries -- which is what made a pivot
        // question take ten seconds before the first token (spec 6.4).
        const [gaps, events, visits, opportunities, roadmap, clubs] = await Promise.all([
          ucFn("get_skill_gap", { target_path: name, student_skills: studentSkills }),
          ucFn("find_events", { target_path: name, major: "", days_ahead }),
          ucFn("companies_visiting", { target_path: name, days_ahead }),
          ucFn("find_opportunities", { target_path: name, opp_type: "" }),
          ucFn("build_gap_roadmap", {
            target_path: name,
            student_skills: studentSkills,
            days_ahead: 90,
          }),
          sql(
            `SELECT club_id, club_name, meeting_day, skills_developed
               FROM ${T("clubs")} WHERE array_contains(career_paths, :pid)
               ORDER BY members_mock DESC LIMIT 6`,
            { pid: path.path_id },
          ),
        ]);

        remember(ctx, events as Record<string, unknown>[], "event_id");
        remember(ctx, visits as Record<string, unknown>[], "event_id");
        remember(ctx, opportunities as Record<string, unknown>[], "opportunity_id");
        remember(ctx, roadmap as Record<string, unknown>[], "item_id");
        remember(ctx, clubs as Record<string, unknown>[], "club_id");

        return {
          path_id: path.path_id,
          path_name: name,
          gaps: pick(
            (gaps as Record<string, unknown>[]).filter((g) => g.has_skill !== true),
            ["skill_name", "importance"],
            8,
          ),
          events: pick(
            events as Record<string, unknown>[],
            ["event_id", "title", "event_type", "start_ts", "location", "company_name"],
            10,
          ),
          visits: pick(
            visits as Record<string, unknown>[],
            ["event_id", "company_name", "visit_date", "visit_type", "roles_recruiting"],
            8,
          ),
          opportunities: pick(
            opportunities as Record<string, unknown>[],
            ["opportunity_id", "title", "opportunity_type", "company_name", "deadline", "location"],
            8,
          ),
          roadmap: pick(
            roadmap as Record<string, unknown>[],
            ["item_type", "item_id", "name", "when_text", "closes_gaps"],
            10,
          ),
          clubs: pick(
            clubs as Record<string, unknown>[],
            ["club_id", "club_name", "meeting_day", "skills_developed"],
            6,
          ),
        };
      },
    }),

    list_career_paths: tool({
      description:
        "List the career paths HokiePath knows about. Use when the student's goal is vague or ambiguous.",
      inputSchema: z.object({}),
      execute: async () =>
        (await careerPaths()).map((p) => ({
          path_id: p.path_id,
          path_name: p.path_name,
          career_family: p.career_family,
          core_skills: p.core_skills.slice(0, 6),
        })),
    }),

    get_skill_gap: tool({
      description:
        "Compare the student's skills to a career path. Rows with has_skill=false are the gaps.",
      inputSchema: z.object({ target_path: z.string() }),
      execute: async ({ target_path }) =>
        trim(
          await ucFn("get_skill_gap", {
            target_path: await targetPathName(target_path),
            student_skills: studentSkills,
          }),
        ),
    }),

    build_gap_roadmap: tool({
      description:
        "Build an ordered plan of events, clubs and courses that close the student's gaps for a path.",
      inputSchema: z.object({
        target_path: z.string(),
        days_ahead: z.number().int().min(1).max(180).default(90),
      }),
      execute: async ({ target_path, days_ahead }) =>
        trim(
          remember(
            ctx,
            await ucFn("build_gap_roadmap", {
              target_path: await targetPathName(target_path),
              student_skills: studentSkills,
              days_ahead,
            }),
            "item_id",
          ),
        ),
    }),

    find_events: tool({
      description: "Upcoming Virginia Tech events for a career path and/or major within N days.",
      inputSchema: z.object({
        target_path: z.string().default(""),
        major: z.string().default(""),
        days_ahead: z.number().int().min(1).max(120).default(30),
      }),
      execute: async ({ target_path, major, days_ahead }) =>
        pick(
          remember(
            ctx,
            await ucFn("find_events", {
              target_path: await targetPathName(target_path),
              major,
              days_ahead,
            }),
            "event_id",
          ),
          ["event_id", "title", "event_type", "start_ts", "location", "company_name"],
          12,
        ),
    }),

    companies_visiting: tool({
      description: "Companies coming to campus for a path in the next N days (Recruiter Radar).",
      inputSchema: z.object({
        target_path: z.string().default(""),
        days_ahead: z.number().int().min(1).max(120).default(60),
      }),
      execute: async ({ target_path, days_ahead }) =>
        pick(
          remember(
            ctx,
            await ucFn("companies_visiting", {
              target_path: await targetPathName(target_path),
              days_ahead,
            }),
            "event_id",
          ),
          ["event_id", "company_name", "visit_date", "visit_type", "roles_recruiting"],
          12,
        ),
    }),

    find_opportunities: tool({
      description: "Open internships, full-time roles and research positions for a path.",
      inputSchema: z.object({
        target_path: z.string().default(""),
        opp_type: z.enum(["internship", "full_time", "research", ""]).default(""),
      }),
      execute: async ({ target_path, opp_type }) =>
        pick(
          remember(
            ctx,
            await ucFn("find_opportunities", {
              target_path: await targetPathName(target_path),
              opp_type,
            }),
            "opportunity_id",
          ),
          ["opportunity_id", "title", "opportunity_type", "company_name", "deadline", "location"],
          12,
        ),
    }),

    get_path_outlook: tool({
      description: "Median salary, typical majors and O*NET code for a career path.",
      inputSchema: z.object({ path_id: z.string() }),
      execute: async ({ path_id }) => {
        const path = (await pathById(path_id)) ?? (await resolvePath(path_id));
        if (!path) return { error: "No such career path." };
        // bls_wages only exists once databricks/02_ingest_external_apis.py has run (spec 12.6); a
        // missing table or a code with no national-median series falls back to the mock salary.
        // One field, always present, always labeled with where the number actually came from --
        // never let the model present an estimate as a measured wage.
        const wage = path.onet_soc_code
          ? await sql<{ median_annual_wage: number; year: number }>(
              `SELECT median_annual_wage, year FROM ${T("bls_wages")}
                WHERE soc_code = :soc ORDER BY year DESC LIMIT 1`,
              { soc: path.onet_soc_code },
            ).catch(() => [])
          : [];
        return {
          path_id: path.path_id,
          path_name: path.path_name,
          median_salary: wage[0]
            ? { amount: wage[0].median_annual_wage, year: wage[0].year, source: "bls" as const }
            : { amount: path.median_salary_usd_mock, year: null, source: "estimated" as const },
          typical_majors: path.typical_majors,
          onet_soc_code: path.onet_soc_code,
        };
      },
    }),

    find_clubs: tool({
      description: "Student organizations at VT that build the skills a career path needs.",
      inputSchema: z.object({ target_path: z.string() }),
      execute: async ({ target_path }) => {
        const path = await resolvePath(target_path);
        if (!path) return [];
        return trim(
          remember(
            ctx,
            await sql(
              `SELECT club_id, club_name, category, meeting_day, meeting_time, skills_developed
                 FROM ${T("clubs")} WHERE array_contains(career_paths, :pid)
                 ORDER BY members_mock DESC LIMIT 8`,
              { pid: path.path_id },
            ),
            "club_id",
          ),
        );
      },
    }),

    semantic_search: tool({
      description:
        "Search events and opportunities by meaning, not just keywords (e.g. 'learn valuation' " +
        "finds a DCF workshop). Use when the student describes what they want to learn or do " +
        "rather than naming a career path.",
      inputSchema: z.object({
        query: z.string().min(1).max(200),
        kind: z.enum(["events", "opportunities"]).default("events"),
        k: z.number().int().min(1).max(15).default(8),
      }),
      execute: async ({ query, kind, k }) => {
        const result = await search(query, {
          events: kind === "events",
          opportunities: kind === "opportunities",
          clubs: false,
          k,
        });
        return trim(
          remember(
            ctx,
            kind === "events"
              ? (result.events as unknown as Record<string, unknown>[])
              : (result.opportunities as unknown as Record<string, unknown>[]),
            kind === "events" ? "id" : "id",
          ),
        );
      },
    }),

    render_dashboard: tool({
      description:
        "Open or update a dashboard tab for a career goal. Call this ONCE per answer, using only ids " +
        "returned by earlier tool calls in this conversation.\n" +
        "tab_id must be a path id like CP04. sections is a list of 3-8 objects, each with an exact " +
        '"type" from this list (these spellings are required):\n' +
        '  {"type":"readiness"}\n' +
        '  {"type":"skill_gap"}\n' +
        '  {"type":"roadmap","days_ahead":90}\n' +
        '  {"type":"event_list","title":"IB events","event_ids":["EV0037"]}\n' +
        '  {"type":"company_radar","title":"Banks coming to VT","visit_event_ids":["EV0002"]}\n' +
        '  {"type":"club_grid","club_ids":["CL001"]}\n' +
        '  {"type":"opportunity_list","opportunity_ids":["OP0058"]}\n' +
        '  {"type":"insight","markdown":"one short paragraph"}\n' +
        "Course codes (FIN 4114) have no section; mention them in your answer instead.",
      inputSchema: DashboardSpecSchema,
      execute: async (spec) => saveTabAndReturn(ctx, spec),
    }),
  };
}

/**
 * Validate every ID against Unity Catalog before persisting, so a hallucinated ID can never reach
 * the UI. Unknown IDs are dropped and logged (spec 10.6).
 */
export async function saveTabAndReturn(ctx: ToolContext, spec: DashboardSpec) {
  const path = await pathById(spec.tab_id);
  if (!path) {
    return {
      ok: false,
      error: `Unknown tab_id ${spec.tab_id}. Use a path_id from list_career_paths.`,
    };
  }

  const ids = collectIds(spec);
  const known = await verifyIds(ids);
  const { spec: cleaned, dropped } = pruneUnknownIds({ ...spec, title: path.path_name }, known);
  if (dropped.length > 0) {
    console.warn(`[agent] dropped ${dropped.length} unknown ids from a dashboard spec`, dropped);
  }

  const layout = await getDashboardLayout(ctx.profile.userId);
  const next = upsertTab(layout, cleaned);
  await saveDashboardLayout(ctx.profile.userId, next, path.path_name);
  ctx.renderedTabs.push(cleaned);

  return {
    ok: true,
    tab_id: cleaned.tab_id,
    title: cleaned.title,
    sections: cleaned.sections.length,
    dropped_ids: dropped,
  };
}

/** One batched existence check per catalog table. */
async function verifyIds(ids: { events: string[]; clubs: string[]; opportunities: string[] }) {
  const lookup = async (table: string, column: string, values: string[]) => {
    if (values.length === 0) return new Set<string>();
    const rows = await sql<Record<string, string>>(
      `SELECT ${column} FROM ${T(table)}
        WHERE ${column} IN (SELECT explode(from_json(:ids, 'array<string>')))`,
      { ids: JSON.stringify(values) },
    );
    return new Set(rows.map((r) => r[column]).filter((v): v is string => typeof v === "string"));
  };

  const [events, clubs, opportunities] = await Promise.all([
    lookup("events", "event_id", ids.events),
    lookup("clubs", "club_id", ids.clubs),
    lookup("opportunities", "opportunity_id", ids.opportunities),
  ]);
  return { events, clubs, opportunities };
}
