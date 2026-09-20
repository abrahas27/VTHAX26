// src/lib/dashboard.ts : assemble a dashboard tab from Unity Catalog (spec F4, 9.1).
import "server-only";
import { settle } from "@/lib/settle";
import { careerPaths, pathById, pathSkills } from "@/lib/catalog";
import { ucFn } from "@/lib/databricks/functions";
import { sql, T } from "@/lib/databricks/sql";
import { missingSkills, readiness, scoreEvent } from "@/lib/scoring";
import type {
  ClubItem,
  DashboardPayload,
  EventItem,
  OpportunityItem,
  RoadmapItem,
  SkillGap,
  SkillProfile,
} from "@/lib/types";

// Raw shapes returned by the UC Functions (verified against the live warehouse).
export interface EventRow {
  event_id: string;
  title: string;
  event_type: string;
  start_ts: string;
  location: string | null;
  host_name: string | null;
  company_name: string | null;
  path_names: string[] | null;
  related_skills: string[] | null;
}
interface VisitRow {
  company_name: string;
  industry: string | null;
  visit_date: string;
  visit_type: string;
  event_id: string;
  roles_recruiting: string[] | null;
  vt_alumni_attending: boolean;
  on_campus_interviews: boolean;
}
export interface OpportunityRow {
  opportunity_id: string;
  title: string;
  opportunity_type: string;
  company_name: string;
  path_name: string | null;
  required_skills: string[] | null;
  class_years: string[] | null;
  location: string | null;
  deadline: string | null;
  deadline_estimated?: boolean | null;
  apply_url?: string | null;
}
export interface RoadmapRow {
  item_type: string;
  item_id: string | null;
  name: string;
  when_text: string | null;
  closes_gaps: string[] | null;
}
interface GapRow {
  skill_name: string;
  importance: number;
  has_skill: boolean;
}
export interface ClubRow {
  club_id: string;
  club_name: string;
  category: string;
  meeting_day: string | null;
  meeting_time: string | null;
  skills_developed: string[] | null;
  description: string | null;
  gobblerconnect_url: string | null;
  application_required: boolean;
}

export const toEvent = (row: EventRow): EventItem => ({
  id: row.event_id,
  title: row.title,
  type: row.event_type,
  start: row.start_ts,
  location: row.location ?? "TBA",
  host: row.host_name ?? row.company_name ?? "Virginia Tech",
  companyName: row.company_name ?? undefined,
  pathNames: row.path_names ?? [],
  skills: row.related_skills ?? [],
  isVirtual: (row.location ?? "").toLowerCase().includes("virtual"),
});

/**
 * The opportunities table uses `opportunity_type`/`company_name`; the UI uses `type`/`companyName`.
 * Both the dashboard fan-out and /api/items/batch map through here so the two cannot drift.
 */
export const toOpportunity = (row: OpportunityRow): OpportunityItem => ({
  id: row.opportunity_id,
  title: row.title,
  type: row.opportunity_type,
  companyName: row.company_name,
  pathName: row.path_name ?? null,
  requiredSkills: row.required_skills ?? [],
  classYears: row.class_years ?? [],
  location: row.location,
  deadline: row.deadline,
  deadlineEstimated: row.deadline_estimated ?? false,
  applyUrl: row.apply_url ?? null,
});

export interface DashboardOptions {
  profile: SkillProfile;
  /** "for-you" uses the primary goal; a CPxx id renders that goal's tab. */
  tab: string;
  days: number;
  /**
   * "core" leaves out the Gap-to-Goal roadmap. build_gap_roadmap is consistently the slowest UC
   * Function (it joins events, clubs and courses against the gap list), so on the first paint the
   * client asks for "core" and fetches "roadmap" alongside it: the cards appear at the speed of
   * the fastest five calls instead of the slowest six (spec 6.4).
   */
  sections?: "all" | "core" | "roadmap";
}

/**
 * Fan out to the UC Functions in parallel, score results server-side, and shape one tab.
 * A failed section degrades to empty with an entry in `errors`, so one dead tool cannot
 * take down the page (spec 14.3).
 */
export async function buildDashboard({
  profile,
  tab,
  days,
  sections = "all",
}: DashboardOptions): Promise<DashboardPayload> {
  const wantsCore = sections !== "roadmap";
  const wantsRoadmap = sections !== "core";
  const pathId = tab === "for-you" ? profile.primaryGoal : tab;
  const studentSkills = profile.skills.map((s) => s.name).join(", ");

  const none = <T>() => Promise.resolve([] as T[]);

  // Nothing here depends on anything else here, including the two cached catalog reads: a cold
  // instance would otherwise pay for career_paths and path_skills in series on top of the UC
  // calls. `path` used to be awaited before the fan-out could even be described, which is why
  // pathName is resolved from the same careerPaths() list rather than from pathById().
  const [paths, allPathSkills, eventsRes, visitsRes, oppsRes, roadmapRes, clubsRes, gapsRes] =
    await Promise.all([
      careerPaths(),
      pathSkills(),
      settle(
        "events",
        wantsCore
          ? ucFnForPath<EventRow>(pathId, (name) =>
              ucFn<EventRow>("find_events", { target_path: name, major: "", days_ahead: days }),
            )
          : none<EventRow>(),
        [] as EventRow[],
      ),
      settle(
        "visits",
        wantsCore
          ? ucFnForPath<VisitRow>(pathId, (name) =>
              ucFn<VisitRow>("companies_visiting", { target_path: name, days_ahead: 45 }),
            )
          : none<VisitRow>(),
        [] as VisitRow[],
      ),
      settle(
        "opportunities",
        wantsCore
          ? ucFnForPath<OpportunityRow>(pathId, (name) =>
              ucFn<OpportunityRow>("find_opportunities", { target_path: name, opp_type: "" }),
            )
          : none<OpportunityRow>(),
        [] as OpportunityRow[],
      ),
      settle(
        "roadmap",
        wantsRoadmap
          ? ucFnForPath<RoadmapRow>(pathId, (name) =>
              ucFn<RoadmapRow>("build_gap_roadmap", {
                target_path: name,
                student_skills: studentSkills,
                days_ahead: 90,
              }),
            )
          : none<RoadmapRow>(),
        [] as RoadmapRow[],
      ),
      settle("clubs", wantsCore ? clubsForPath(pathId) : none<ClubRow>(), [] as ClubRow[]),
      settle(
        "gaps",
        wantsCore && pathId
          ? ucFnForPath<GapRow>(pathId, (name) =>
              ucFn<GapRow>("get_skill_gap", { target_path: name, student_skills: studentSkills }),
            )
          : none<GapRow>(),
        [] as GapRow[],
      ),
    ]);

  const path = pathId ? paths.find((p) => p.path_id === pathId) : undefined;
  const pathName = path?.path_name ?? null;

  const errors = [eventsRes, visitsRes, oppsRes, roadmapRes, clubsRes, gapsRes]
    .map((r) => r.error)
    .filter((e): e is string => Boolean(e));

  const requirements = pathId ? allPathSkills.filter((r) => r.path_id === pathId) : [];
  const missing = missingSkills(profile.skills, requirements);
  const families = new Map(paths.map((p) => [p.path_name, p.career_family]));

  const companyRecruitsForGoal = new Set(visitsRes.value.map((v) => v.company_name));

  const events = eventsRes.value
    .map(toEvent)
    .map((event) => {
      const { score, why } = scoreEvent({
        event,
        missing,
        goalPathName: pathName,
        goalFamily: path?.career_family ?? null,
        eventFamilies: event.pathNames.map((p) => families.get(p) ?? "").filter(Boolean),
        majorCode: profile.majorCode,
        eventMajors: ["ALL"], // find_events already filters by major when one is supplied
        companyRecruitsForGoal: event.companyName
          ? companyRecruitsForGoal.has(event.companyName)
          : false,
      });
      return { ...event, score, why };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const gaps: SkillGap[] = gapsRes.value.map((g) => ({
    skillName: g.skill_name,
    importance: g.importance,
    hasSkill: g.has_skill,
  }));

  const score = readiness(profile.skills, requirements);

  return {
    tab,
    goal: { pathId: pathId ?? null, pathName, medianSalary: path?.median_salary_usd_mock ?? null },
    readiness: {
      pathId: pathId ?? null,
      pathName,
      score,
      topGaps: missing.slice(0, 3).map((m) => m.skill_name),
    },
    gaps,
    events,
    visits: visitsRes.value.map((v) => ({
      id: v.event_id,
      companyName: v.company_name,
      industry: v.industry ?? "",
      visitDate: v.visit_date,
      visitType: v.visit_type,
      rolesRecruiting: v.roles_recruiting ?? [],
      alumniAttending: v.vt_alumni_attending,
      onCampusInterviews: v.on_campus_interviews,
      matchesGoal: pathName ? (v.roles_recruiting ?? []).includes(pathName) : false,
    })),
    clubs: clubsRes.value.map(toClub),
    opportunities: oppsRes.value.map(toOpportunity),
    roadmapPreview: roadmapRes.value.map(toRoadmapItem),
    ...(errors.length > 0 ? { errors } : {}),
  };
}

export const toRoadmapItem = (row: RoadmapRow): RoadmapItem => ({
  itemType: (row.item_type as RoadmapItem["itemType"]) ?? "action",
  itemId: row.item_id,
  name: row.name,
  whenText: row.when_text,
  closesGaps: row.closes_gaps ?? [],
});

export const toClub = (row: ClubRow): ClubItem => ({
  id: row.club_id,
  name: row.club_name,
  category: row.category,
  meetingDay: row.meeting_day,
  meetingTime: row.meeting_time,
  skills: row.skills_developed ?? [],
  description: row.description,
  url: row.gobblerconnect_url,
  applicationRequired: row.application_required,
});

/** clubs.career_paths holds path_ids (CP04), unlike events which carry path names. */
async function clubsForPath(pathId: string | null): Promise<ClubRow[]> {
  if (!pathId) {
    return sql<ClubRow>(
      `SELECT club_id, club_name, category, meeting_day, meeting_time, skills_developed,
              description, gobblerconnect_url, application_required
         FROM ${T("clubs")} ORDER BY members_mock DESC LIMIT 6`,
    );
  }
  return sql<ClubRow>(
    `SELECT club_id, club_name, category, meeting_day, meeting_time, skills_developed,
            description, gobblerconnect_url, application_required
       FROM ${T("clubs")}
      WHERE array_contains(career_paths, :pid)
      ORDER BY members_mock DESC
      LIMIT 6`,
    { pid: pathId },
  );
}

/**
 * The UC Functions filter on the exact path name, so each call needs it resolved first. Looking it
 * up inside the fan-out (from the cached catalog) rather than before it keeps every call on the
 * same starting line; an unset goal passes "" through, which the functions read as "any".
 */
async function ucFnForPath<T>(
  pathId: string | null,
  call: (pathName: string) => Promise<T[]>,
): Promise<T[]> {
  return call(pathId ? ((await pathById(pathId))?.path_name ?? "") : "");
}
