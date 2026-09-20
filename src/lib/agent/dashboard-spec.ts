// src/lib/agent/dashboard-spec.ts : the contract behind the morphing UI (spec 10.6).
// The agent emits IDs only; the client hydrates them through /api/items/batch, so rendering never
// trusts LLM-written facts.
import { z } from "zod";

const idList = (max: number) => z.array(z.string()).max(max).default([]);

export const SectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("readiness") }),
  z.object({ type: z.literal("skill_gap") }),
  z.object({
    type: z.literal("roadmap"),
    days_ahead: z.number().int().min(1).max(365).default(90),
  }),
  z.object({
    type: z.literal("event_list"),
    title: z.string().max(60),
    event_ids: idList(12),
  }),
  z.object({
    type: z.literal("company_radar"),
    title: z.string().max(60),
    visit_event_ids: idList(12),
  }),
  z.object({ type: z.literal("club_grid"), club_ids: idList(8) }),
  z.object({ type: z.literal("opportunity_list"), opportunity_ids: idList(10) }),
  // The only free text the agent may put on the dashboard.
  z.object({ type: z.literal("insight"), markdown: z.string().max(600) }),
]);

export type Section = z.infer<typeof SectionSchema>;

export const DashboardSpecSchema = z.object({
  tab_id: z
    .string()
    .regex(/^CP\d{2}$/)
    .describe('The career path id, e.g. "CP04". One tab per path.'),
  title: z.string().max(40).describe("The career path name, e.g. Investment Banking"),
  source_question: z.string().max(200).describe("The student's question, quoted verbatim"),
  sections: z
    .array(SectionSchema)
    .min(3)
    .max(8)
    .describe(
      'Each section needs an exact "type": readiness, skill_gap, roadmap, event_list, ' +
        "company_radar, club_grid, opportunity_list or insight.",
    ),
});

export type DashboardSpec = z.infer<typeof DashboardSpecSchema>;

/** Every id a spec references, grouped by the catalog table that can confirm it. */
export function collectIds(spec: DashboardSpec): {
  events: string[];
  clubs: string[];
  opportunities: string[];
} {
  const events = new Set<string>();
  const clubs = new Set<string>();
  const opportunities = new Set<string>();

  for (const section of spec.sections) {
    switch (section.type) {
      case "event_list":
        section.event_ids.forEach((id) => events.add(id));
        break;
      case "company_radar":
        // A company visit is rendered through the event it belongs to.
        section.visit_event_ids.forEach((id) => events.add(id));
        break;
      case "club_grid":
        section.club_ids.forEach((id) => clubs.add(id));
        break;
      case "opportunity_list":
        section.opportunity_ids.forEach((id) => opportunities.add(id));
        break;
      default:
        break;
    }
  }
  return { events: [...events], clubs: [...clubs], opportunities: [...opportunities] };
}

/** Drop ids that do not exist in Unity Catalog, returning the cleaned spec and what was removed. */
export function pruneUnknownIds(
  spec: DashboardSpec,
  known: { events: Set<string>; clubs: Set<string>; opportunities: Set<string> },
): { spec: DashboardSpec; dropped: string[] } {
  const dropped: string[] = [];
  const keep = (id: string, set: Set<string>) => {
    if (set.has(id)) return true;
    dropped.push(id);
    return false;
  };

  const sections = spec.sections.map((section) => {
    switch (section.type) {
      case "event_list":
        return { ...section, event_ids: section.event_ids.filter((id) => keep(id, known.events)) };
      case "company_radar":
        return {
          ...section,
          visit_event_ids: section.visit_event_ids.filter((id) => keep(id, known.events)),
        };
      case "club_grid":
        return { ...section, club_ids: section.club_ids.filter((id) => keep(id, known.clubs)) };
      case "opportunity_list":
        return {
          ...section,
          opportunity_ids: section.opportunity_ids.filter((id) => keep(id, known.opportunities)),
        };
      default:
        return section;
    }
  });

  return { spec: { ...spec, sections }, dropped };
}

/** Tabs are stored as an ordered array; asking about the same path focuses the existing tab. */
export interface DashboardLayout {
  tabs: DashboardSpec[];
}

export function upsertTab(layout: DashboardLayout, spec: DashboardSpec): DashboardLayout {
  const index = layout.tabs.findIndex((tab) => tab.tab_id === spec.tab_id);
  if (index === -1) return { tabs: [...layout.tabs, spec] };
  const tabs = [...layout.tabs];
  tabs[index] = spec; // refresh in place, keeping tab order stable across reloads
  return { tabs };
}
