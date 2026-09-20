// src/lib/scoring.ts : deterministic scoring (spec 10.7). Pure functions, no I/O, unit-tested.
import type { CareerPath, EventItem, PathSkill, Preferences, ProfileSkill } from "@/lib/types";

/** What each path rewards, used by the energizer term of FIT (spec 10.7). */
export const PATH_ENERGIZERS: Record<string, string[]> = {
  CP01: ["Building things", "Solving puzzles"],
  CP02: ["Analyzing data", "Solving puzzles"],
  CP03: ["Building things", "Solving puzzles"],
  CP04: ["Analyzing data", "Persuading and leading"],
  CP05: ["Analyzing data", "Solving puzzles"],
  CP06: ["Analyzing data", "Persuading and leading"],
  CP07: ["Persuading and leading", "Analyzing data"],
  CP08: ["Analyzing data", "Building things"],
  CP09: ["Persuading and leading", "Helping people"],
  CP10: ["Solving puzzles", "Building things"],
  CP11: ["Building things", "Designing experiences"],
  CP12: ["Designing experiences", "Helping people"],
  CP13: ["Building things", "Solving puzzles"],
  CP14: ["Analyzing data", "Helping people"],
  CP15: ["Helping people", "Persuading and leading"],
  CP16: ["Building things", "Analyzing data"],
  CP17: ["Solving puzzles", "Analyzing data"],
  CP18: ["Helping people", "Persuading and leading"],
  CP19: ["Persuading and leading", "Designing experiences"],
};

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

/** level(s): the student's level for skill s in 0..4, where 0 means missing. */
export function levelOf(skills: ProfileSkill[], skillName: string): number {
  const match = skills.find((s) => s.name.toLowerCase() === skillName.toLowerCase());
  return match?.level ?? 0;
}

/**
 * READINESS(path) = round(100 * SUM[ importance * min(level,3)/3 ] / SUM[ importance ]).
 * Level 3 (Advanced) already counts as full credit, so Expert is not required everywhere.
 */
export function readiness(skills: ProfileSkill[], requirements: PathSkill[]): number {
  const total = requirements.reduce((sum, r) => sum + r.importance, 0);
  if (total === 0) return 0;
  const earned = requirements.reduce(
    (sum, r) => sum + r.importance * (Math.min(levelOf(skills, r.skill_name), 3) / 3),
    0,
  );
  return Math.round(clamp((100 * earned) / total));
}

export interface FitInput {
  path: CareerPath;
  requirements: PathSkill[];
  skills: ProfileSkill[];
  preferences: Preferences;
  majorCode: string | null;
}

/**
 * FIT = 0.55*readiness + 0.25*interested + 0.10*major match + 0.10*energizer overlap.
 * Interest and major are the two things a resume cannot tell us, which is why the
 * questionnaire drives ranking rather than the resume alone.
 */
export function fitScore({ path, requirements, skills, preferences, majorCode }: FitInput): number {
  const ready = readiness(skills, requirements);
  const interested = preferences.interestedPaths.includes(path.path_id) ? 100 : 0;
  const majorMatch = majorCode && path.typical_majors.includes(majorCode) ? 100 : 0;

  const wanted = PATH_ENERGIZERS[path.path_id] ?? [];
  const mine = preferences.energizers;
  const shared = wanted.filter((e) => mine.includes(e)).length;
  const energizer = (100 * shared) / Math.max(1, mine.length);

  return Math.round(clamp(0.55 * ready + 0.25 * interested + 0.1 * majorMatch + 0.1 * energizer));
}

export interface EventScoreInput {
  event: EventItem;
  missing: PathSkill[]; // gaps for the goal path, with importance
  goalPathName: string | null;
  goalFamily?: string | null;
  eventFamilies?: string[]; // career families of the event's paths
  majorCode: string | null;
  eventMajors?: string[];
  companyRecruitsForGoal?: boolean;
  today?: Date;
}

export interface ScoredEvent {
  score: number;
  why: string[];
}

/**
 * EVENT_SCORE = 0.45*gapCoverage + 0.25*pathMatch + 0.15*majorMatch + 0.10*proximity
 *             + 0.05*companyFit, returned with the "Why this?" chips (spec 10.7, F4).
 */
export function scoreEvent(input: EventScoreInput): ScoredEvent {
  const { event, missing, goalPathName, majorCode, today = new Date() } = input;

  const missingTotal = missing.reduce((sum, m) => sum + m.importance, 0);
  const covered = missing.filter((m) =>
    event.skills.some((s) => s.toLowerCase() === m.skill_name.toLowerCase()),
  );
  const gapCoverage =
    missingTotal === 0 ? 0 : covered.reduce((sum, m) => sum + m.importance, 0) / missingTotal;

  const pathMatch = goalPathName
    ? event.pathNames.some((p) => p.toLowerCase() === goalPathName.toLowerCase())
      ? 1
      : input.goalFamily && input.eventFamilies?.includes(input.goalFamily)
        ? 0.3
        : 0
    : 0;

  const eventMajors = input.eventMajors ?? [];
  const majorMatch =
    eventMajors.includes("ALL") || (majorCode !== null && eventMajors.includes(majorCode)) ? 1 : 0;

  const days = Math.max(0, (new Date(event.start).getTime() - today.getTime()) / 86_400_000);
  const proximity = 1 - Math.min(days, 45) / 45;

  const companyFit = input.companyRecruitsForGoal ? 1 : 0;

  const score =
    0.45 * gapCoverage + 0.25 * pathMatch + 0.15 * majorMatch + 0.1 * proximity + 0.05 * companyFit;

  return { score: Math.round(score * 1000) / 1000, why: whyChips(covered, pathMatch, majorMatch) };
}

/** Top 2 gaps closed, else "Matches your goal", else "Open to your major". */
function whyChips(covered: PathSkill[], pathMatch: number, majorMatch: number): string[] {
  if (covered.length > 0) {
    return [...covered]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 2)
      .map((m) => `Builds ${m.skill_name}`);
  }
  if (pathMatch > 0) return ["Matches your goal"];
  if (majorMatch > 0) return ["Open to your major"];
  return [];
}

/** The gaps (has_skill = false) for a path, most important first. */
export function missingSkills(skills: ProfileSkill[], requirements: PathSkill[]): PathSkill[] {
  return requirements
    .filter((r) => levelOf(skills, r.skill_name) === 0)
    .sort((a, b) => b.importance - a.importance);
}

/** Highest-fit path among the ones the student marked interesting, else the best overall. */
export function pickPrimaryGoal(
  fitScores: Record<string, number>,
  interestedPaths: string[],
): string | null {
  const entries = Object.entries(fitScores);
  if (entries.length === 0) return null;
  const pool = entries.filter(([id]) => interestedPaths.includes(id));
  const best = (pool.length > 0 ? pool : entries).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  return best?.[0] ?? null;
}

/** Roadmap size from questionnaire Q6: fewer hours shows fewer items per month (F7). */
export function roadmapItemsPerMonth(hoursPerWeek: Preferences["hoursPerWeek"]): number {
  switch (hoursPerWeek) {
    case "1-2":
      return 4;
    case "3-5":
      return 6;
    case "6-10":
      return 10;
    default:
      return Number.POSITIVE_INFINITY;
  }
}
