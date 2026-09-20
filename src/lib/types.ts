// src/lib/types.ts : shared contracts (spec 8.4). Field names mirror the Unity Catalog columns.

export type SkillLevel = 1 | 2 | 3 | 4; // Beginner..Expert

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  1: "Beginner",
  2: "Intermediate",
  3: "Advanced",
  4: "Expert",
};

export type ClassYear = "Freshman" | "Sophomore" | "Junior" | "Senior" | "Graduate";

export interface ProfileSkill {
  name: string;
  level: SkillLevel;
  evidence?: string;
  source: "resume" | "self" | "questionnaire";
  canonical: boolean;
}

export interface Preferences {
  seeking: ("internship" | "full_time" | "research" | "exploring")[];
  interestedPaths: string[]; // path_ids
  energizers: string[];
  industries: string[];
  locations: string[];
  hoursPerWeek: "1-2" | "3-5" | "6-10" | "10+";
  flags: {
    needsSponsorship?: boolean;
    gpaConcerns?: boolean;
    firstGen?: boolean;
    transfer?: boolean;
  };
}

export interface SkillProfile {
  userId: string;
  displayName: string;
  majorCode: string | null;
  classYear: ClassYear | null;
  skills: ProfileSkill[];
  preferences: Preferences;
  fitScores: Record<string, number>; // path_id -> 0..100
  primaryGoal: string | null; // path_id
}

// ---------------------------------------------------------------- catalog

export interface CareerPath {
  path_id: string;
  path_name: string;
  career_family: string;
  core_skills: string[];
  typical_majors: string[];
  median_salary_usd_mock: number | null;
  onet_soc_code: string | null;
  description: string | null;
}

export interface Skill {
  skill_id: string;
  skill_name: string;
  category: string;
}

export interface Major {
  major_code: string;
  major_name: string;
  college: string;
}

export interface PathSkill {
  path_id: string;
  skill_id: string;
  skill_name: string;
  importance: number; // 0..1
}

// ---------------------------------------------------------------- dashboard items

export interface EventItem {
  id: string;
  title: string;
  type: string;
  start: string;
  end?: string;
  location: string;
  host: string;
  companyName?: string;
  pathNames: string[];
  skills: string[];
  isVirtual: boolean;
  why?: string[];
  score?: number;
}

export interface VisitItem {
  id: string; // event_id of the visit, which is how it is hydrated
  companyName: string;
  industry: string;
  visitDate: string;
  visitType: string;
  rolesRecruiting: string[];
  alumniAttending: boolean;
  onCampusInterviews: boolean;
  matchesGoal?: boolean;
}

export interface ClubItem {
  id: string;
  name: string;
  category: string;
  meetingDay: string | null;
  meetingTime: string | null;
  skills: string[];
  description: string | null;
  url: string | null;
  applicationRequired: boolean;
  why?: string[];
}

export interface OpportunityItem {
  id: string;
  title: string;
  type: string;
  companyName: string;
  pathName: string | null;
  requiredSkills: string[];
  classYears: string[];
  location: string | null;
  deadline: string | null;
  applyUrl?: string | null;
}

export interface RoadmapItem {
  itemType: "event" | "club" | "course" | "opportunity" | "action";
  itemId: string | null;
  name: string;
  whenText: string | null;
  closesGaps: string[];
  completed?: boolean;
}

export interface SkillGap {
  skillName: string;
  importance: number;
  hasSkill: boolean;
}

export interface Readiness {
  pathId: string | null;
  pathName: string | null;
  score: number; // 0..100
  topGaps: string[];
}

export interface DashboardPayload {
  tab: string;
  goal: { pathId: string | null; pathName: string | null; medianSalary?: number | null };
  readiness: Readiness;
  gaps: SkillGap[];
  events: EventItem[];
  visits: VisitItem[];
  clubs: ClubItem[];
  opportunities: OpportunityItem[];
  roadmapPreview: RoadmapItem[];
  /** Sections that failed so the UI can show a retry card instead of failing the page (14.3). */
  errors?: string[];
  demoMode?: boolean;
}
