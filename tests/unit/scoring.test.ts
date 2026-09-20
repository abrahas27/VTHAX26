import { describe, expect, it } from "vitest";
import {
  fitScore,
  levelOf,
  missingSkills,
  pickPrimaryGoal,
  readiness,
  roadmapItemsPerMonth,
  scoreEvent,
} from "@/lib/scoring";
import type { CareerPath, EventItem, PathSkill, Preferences, ProfileSkill } from "@/lib/types";

const skill = (name: string, level: 1 | 2 | 3 | 4): ProfileSkill => ({
  name,
  level,
  source: "resume",
  canonical: true,
});

const req = (skill_name: string, importance: number): PathSkill => ({
  path_id: "CP04",
  skill_id: skill_name,
  skill_name,
  importance,
});

const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  seeking: ["internship"],
  interestedPaths: [],
  energizers: [],
  industries: [],
  locations: [],
  hoursPerWeek: "3-5",
  flags: {},
  ...over,
});

describe("levelOf", () => {
  it("returns 0 for a skill the student does not have", () => {
    expect(levelOf([skill("Python", 3)], "DCF Valuation")).toBe(0);
  });

  it("matches case-insensitively", () => {
    expect(levelOf([skill("Python", 3)], "python")).toBe(3);
  });
});

describe("readiness", () => {
  const requirements = [req("Financial Modeling", 1), req("DCF Valuation", 0.5)];

  it("is 0 when every required skill is missing", () => {
    expect(readiness([skill("Python", 4)], requirements)).toBe(0);
  });

  it("is 100 when every requirement is at least Advanced", () => {
    const profile = [skill("Financial Modeling", 3), skill("DCF Valuation", 3)];
    expect(readiness(profile, requirements)).toBe(100);
  });

  it("caps Expert at the same credit as Advanced", () => {
    const advanced = [skill("Financial Modeling", 3), skill("DCF Valuation", 3)];
    const expert = [skill("Financial Modeling", 4), skill("DCF Valuation", 4)];
    expect(readiness(expert, requirements)).toBe(readiness(advanced, requirements));
  });

  it("weights by importance", () => {
    // Only the importance-1.0 skill, at Advanced: 1.0 / 1.5 = 67
    expect(readiness([skill("Financial Modeling", 3)], requirements)).toBe(67);
    // Only the importance-0.5 skill, at Advanced: 0.5 / 1.5 = 33
    expect(readiness([skill("DCF Valuation", 3)], requirements)).toBe(33);
  });

  it("gives partial credit for partial proficiency", () => {
    // Beginner (1) earns 1/3 of its weight: (1 * 1/3) / 1.5 = 22
    expect(readiness([skill("Financial Modeling", 1)], requirements)).toBe(22);
  });

  it("returns 0 rather than dividing by zero when a path has no requirements", () => {
    expect(readiness([skill("Python", 4)], [])).toBe(0);
  });
});

describe("fitScore", () => {
  const path: CareerPath = {
    path_id: "CP04",
    path_name: "Investment Banking",
    career_family: "Finance",
    core_skills: [],
    typical_majors: ["FIN", "ACIS"],
    median_salary_usd_mock: 110000,
    onet_soc_code: null,
    description: null,
  };
  const requirements = [req("Financial Modeling", 1)];

  it("gives a prepared, interested, well-matched student a high score", () => {
    const score = fitScore({
      path,
      requirements,
      skills: [skill("Financial Modeling", 3)],
      preferences: prefs({
        interestedPaths: ["CP04"],
        energizers: ["Analyzing data", "Persuading and leading"],
      }),
      majorCode: "FIN",
    });
    expect(score).toBe(100);
  });

  it("still credits interest when readiness is 0 (the pivot case)", () => {
    const score = fitScore({
      path,
      requirements,
      skills: [skill("Python", 4)],
      preferences: prefs({ interestedPaths: ["CP04"] }),
      majorCode: "CS",
    });
    expect(score).toBe(25); // interest only
  });

  it("scores an unwanted path with no overlap at 0", () => {
    expect(
      fitScore({
        path,
        requirements,
        skills: [skill("Python", 4)],
        preferences: prefs(),
        majorCode: "CS",
      }),
    ).toBe(0);
  });

  it("credits partial energizer overlap proportionally", () => {
    const score = fitScore({
      path,
      requirements,
      skills: [],
      preferences: prefs({ energizers: ["Analyzing data", "Building things"] }),
      majorCode: null,
    });
    expect(score).toBe(5); // 0.10 * 100 * (1 of 2 energizers)
  });
});

describe("scoreEvent", () => {
  const today = new Date("2026-09-19T12:00:00Z");
  const event = (over: Partial<EventItem> = {}): EventItem => ({
    id: "EV0037",
    title: "J.P. Morgan Workshop: Investment Banking",
    type: "technical_workshop",
    start: "2026-09-21T17:00:00.000Z",
    location: "Owens Banquet Hall",
    host: "J.P. Morgan",
    pathNames: ["Investment Banking"],
    skills: ["DCF Valuation", "Financial Modeling"],
    isVirtual: false,
    ...over,
  });
  const missing = [
    req("Financial Modeling", 1),
    req("DCF Valuation", 0.92),
    req("M&A Concepts", 0.7),
  ];

  it("ranks a gap-closing, on-path, imminent event highly", () => {
    const { score, why } = scoreEvent({
      event: event(),
      missing,
      goalPathName: "Investment Banking",
      majorCode: "CS",
      eventMajors: ["ALL"],
      companyRecruitsForGoal: true,
      today,
    });
    expect(score).toBeGreaterThan(0.8);
    expect(why).toEqual(["Builds Financial Modeling", "Builds DCF Valuation"]);
  });

  it("scores an unrelated event near zero", () => {
    const { score, why } = scoreEvent({
      event: event({ pathNames: ["Software Engineering"], skills: ["Python"] }),
      missing,
      goalPathName: "Investment Banking",
      majorCode: "CS",
      eventMajors: ["FIN"],
      today,
    });
    expect(score).toBeLessThan(0.15);
    expect(why).toEqual([]);
  });

  it("gives partial credit to a same-family path", () => {
    const { score, why } = scoreEvent({
      event: event({ pathNames: ["Sales & Trading / Markets"], skills: [] }),
      missing,
      goalPathName: "Investment Banking",
      goalFamily: "Finance",
      eventFamilies: ["Finance"],
      majorCode: null,
      today,
    });
    expect(score).toBeGreaterThan(0.07); // 0.25 * 0.3 path match, plus proximity
    expect(why).toEqual(["Matches your goal"]);
  });

  it("prefers a sooner event, all else equal", () => {
    const soon = scoreEvent({
      event: event(),
      missing,
      goalPathName: "Investment Banking",
      majorCode: null,
      today,
    });
    const later = scoreEvent({
      event: event({ start: "2026-11-30T17:00:00.000Z" }),
      missing,
      goalPathName: "Investment Banking",
      majorCode: null,
      today,
    });
    expect(soon.score).toBeGreaterThan(later.score);
  });

  it("falls back to the major chip when nothing else matches", () => {
    const { why } = scoreEvent({
      event: event({ pathNames: [], skills: [] }),
      missing,
      goalPathName: "Investment Banking",
      majorCode: "CS",
      eventMajors: ["CS"],
      today,
    });
    expect(why).toEqual(["Open to your major"]);
  });

  it("does not divide by zero when the student has no gaps", () => {
    const { score } = scoreEvent({
      event: event(),
      missing: [],
      goalPathName: "Investment Banking",
      majorCode: null,
      today,
    });
    expect(Number.isFinite(score)).toBe(true);
  });
});

describe("missingSkills", () => {
  it("returns only absent skills, most important first", () => {
    const gaps = missingSkills(
      [skill("DCF Valuation", 1)],
      [req("Financial Modeling", 1), req("DCF Valuation", 0.92), req("M&A Concepts", 0.7)],
    );
    expect(gaps.map((g) => g.skill_name)).toEqual(["Financial Modeling", "M&A Concepts"]);
  });
});

describe("pickPrimaryGoal", () => {
  it("prefers the best path the student said they were interested in", () => {
    expect(pickPrimaryGoal({ CP01: 90, CP04: 60 }, ["CP04"])).toBe("CP04");
  });

  it("falls back to the best overall when nothing was selected", () => {
    expect(pickPrimaryGoal({ CP01: 90, CP04: 60 }, [])).toBe("CP01");
  });

  it("breaks ties deterministically by path id", () => {
    expect(pickPrimaryGoal({ CP04: 70, CP01: 70 }, [])).toBe("CP01");
  });

  it("returns null with no scores", () => {
    expect(pickPrimaryGoal({}, ["CP04"])).toBeNull();
  });
});

describe("roadmapItemsPerMonth", () => {
  it("sizes the roadmap by available hours", () => {
    expect(roadmapItemsPerMonth("1-2")).toBe(4);
    expect(roadmapItemsPerMonth("10+")).toBe(Number.POSITIVE_INFINITY);
  });
});
