// Opt-in end-to-end check of the P2 pipeline against the live workspace: RUN_LIVE=1 pnpm test
// resume PDF -> extracted profile -> fit scores -> dashboard payload.
import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const live = process.env.RUN_LIVE === "1";

describe.skipIf(!live)("P2 pipeline (live)", () => {
  let parseResume: typeof import("@/lib/resume").parseResume;
  let extractText: typeof import("@/lib/resume").extractText;
  let buildDashboard: typeof import("@/lib/dashboard").buildDashboard;
  let catalog: typeof import("@/lib/catalog");
  let scoring: typeof import("@/lib/scoring");
  let profile: import("@/lib/types").SkillProfile;

  beforeAll(async () => {
    const preset = { ...process.env };
    process.loadEnvFile?.(".env.local");
    Object.assign(process.env, preset);
    ({ parseResume, extractText } = await import("@/lib/resume"));
    ({ buildDashboard } = await import("@/lib/dashboard"));
    catalog = await import("@/lib/catalog");
    scoring = await import("@/lib/scoring");

    const buf = await readFile("fixtures/resumes/cs.pdf");
    const file = new File([buf], "cs.pdf", { type: "application/pdf" });
    const [skills, majors] = await Promise.all([catalog.skills(), catalog.majors()]);
    const parsed = await parseResume(await extractText(file), skills, majors);

    profile = {
      userId: "test",
      displayName: "Priya",
      majorCode: parsed.majorCode,
      classYear: parsed.classYear,
      skills: parsed.skills,
      preferences: {
        seeking: ["internship"],
        interestedPaths: ["CP01", "CP04"],
        energizers: ["Analyzing data", "Solving puzzles"],
        industries: ["Tech", "Finance"],
        locations: ["NYC"],
        hoursPerWeek: "3-5",
        flags: {},
      },
      fitScores: {},
      primaryGoal: "CP01",
    };
  }, 120_000);

  it("extracts a CS sophomore profile from the fixture resume", () => {
    expect(profile.majorCode).toBe("CS");
    expect(profile.classYear).toBe("Sophomore");
    const names = profile.skills.map((s) => s.name);
    // Spec F2: clearly listed technical skills map to canonical names.
    expect(names).toEqual(expect.arrayContaining(["Python", "Java", "SQL", "Git"]));
  });

  it("scores all 19 career paths and picks a goal the student chose", async () => {
    const [paths, requirements] = await Promise.all([catalog.careerPaths(), catalog.pathSkills()]);
    expect(paths).toHaveLength(19);

    const fitScores = Object.fromEntries(
      paths.map((path) => [
        path.path_id,
        scoring.fitScore({
          path,
          requirements: requirements.filter((r) => r.path_id === path.path_id),
          skills: profile.skills,
          preferences: profile.preferences,
          majorCode: profile.majorCode,
        }),
      ]),
    );
    const goal = scoring.pickPrimaryGoal(fitScores, profile.preferences.interestedPaths);
    expect(profile.preferences.interestedPaths).toContain(goal);
    // Software Engineering should beat Investment Banking for a CS student with no finance skills.
    expect(fitScores.CP01).toBeGreaterThan(fitScores.CP04 ?? 0);
  }, 60_000);

  it("builds a populated For You dashboard with scored events", async () => {
    const payload = await buildDashboard({ profile, tab: "for-you", days: 45 });
    expect(payload.errors ?? []).toEqual([]);
    expect(payload.goal.pathName).toBe("Software Engineering");
    expect(payload.events.length).toBeGreaterThan(0);
    expect(payload.clubs.length).toBeGreaterThan(0);
    expect(payload.opportunities.length).toBeGreaterThan(0);

    // Events come back ranked, and the top one explains itself.
    const scores = payload.events.map((e) => e.score ?? 0);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(payload.events[0]?.why?.length ?? 0).toBeGreaterThan(0);
  }, 120_000);

  it("builds an Investment Banking tab that meets the F6 bar for the seed data", async () => {
    const payload = await buildDashboard({ profile, tab: "CP04", days: 60 });
    expect(payload.goal.pathName).toBe("Investment Banking");
    expect(payload.events.length).toBeGreaterThanOrEqual(5);
    expect(payload.clubs.length).toBeGreaterThanOrEqual(2);
    expect(payload.visits.length).toBeGreaterThanOrEqual(3);
    expect(payload.roadmapPreview.length).toBeGreaterThanOrEqual(6);

    // The pivot is dramatic: a CS student has none of the IB skills yet.
    expect(payload.readiness.score).toBeLessThan(30);
    expect(payload.readiness.topGaps.length).toBeGreaterThan(0);
  }, 120_000);

  it("resolves messy goal names onto real paths so tools cannot return nothing", async () => {
    expect((await catalog.resolvePath("investment-banking"))?.path_id).toBe("CP04");
    expect((await catalog.resolvePath("IB"))?.path_id).toBe("CP04");
    expect((await catalog.resolvePath("investment banking"))?.path_id).toBe("CP04");
    expect((await catalog.resolvePath("CP04"))?.path_id).toBe("CP04");
    expect(await catalog.resolvePath("underwater basket weaving")).toBeUndefined();
  }, 60_000);
});
