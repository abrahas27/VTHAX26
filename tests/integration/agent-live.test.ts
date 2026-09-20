// Opt-in live agent checks: RUN_LIVE=1 pnpm test
// Covers golden questions 1-3 from spec 15.3 and the F6 exit check (the pivot creates a tab that
// persists). Uses a temporary Lakebase user, removed afterwards.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SkillProfile } from "@/lib/types";

const live = process.env.RUN_LIVE === "1";
const TEST_EMAIL = "agent-live-test@example.invalid";

describe.skipIf(!live)("HokiePath agent (live)", () => {
  let generateText: typeof import("ai").generateText;
  let stepCountIs: typeof import("ai").stepCountIs;
  let chatModel: typeof import("@/lib/databricks/llm").chatModel;
  let buildTools: typeof import("@/lib/agent/tools").buildTools;
  let systemPrompt: typeof import("@/lib/agent/system-prompt").systemPrompt;
  let db: typeof import("@/lib/db/queries");
  let guard: typeof import("@/lib/agent/guard");
  let pathNames: Record<string, string>;
  let profile: SkillProfile;

  const ask = async (question: string) => {
    const ctx = {
      profile,
      seenIds: new Set<string>(),
      renderedTabs: [] as import("@/lib/agent/dashboard-spec").DashboardSpec[],
    };
    const result = await generateText({
      model: chatModel(),
      system: systemPrompt(profile, pathNames),
      prompt: question,
      tools: buildTools(ctx),
      stopWhen: stepCountIs(8),
      temperature: 0.3,
      maxOutputTokens: 1500,
    });
    const calls = result.steps.flatMap((s) => s.toolCalls);
    return { text: result.text, calls, ctx };
  };

  beforeAll(async () => {
    const preset = { ...process.env };
    process.loadEnvFile?.(".env.local");
    Object.assign(process.env, preset);

    ({ generateText, stepCountIs } = await import("ai"));
    ({ chatModel } = await import("@/lib/databricks/llm"));
    ({ buildTools } = await import("@/lib/agent/tools"));
    ({ systemPrompt } = await import("@/lib/agent/system-prompt"));
    db = await import("@/lib/db/queries");
    guard = await import("@/lib/agent/guard");
    const catalog = await import("@/lib/catalog");
    pathNames = Object.fromEntries(
      (await catalog.careerPaths()).map((p) => [p.path_id, p.path_name]),
    );

    const userId = await db.upsertUser(TEST_EMAIL, "Agent Test");
    profile = {
      userId,
      displayName: "Priya",
      majorCode: "CS",
      classYear: "Sophomore",
      skills: [
        { name: "Python", level: 3, source: "resume", canonical: true },
        { name: "Java", level: 3, source: "resume", canonical: true },
        { name: "SQL", level: 2, source: "resume", canonical: true },
        { name: "Data Structures & Algorithms", level: 3, source: "resume", canonical: true },
      ],
      preferences: {
        seeking: ["internship"],
        interestedPaths: ["CP01"],
        energizers: ["Solving puzzles"],
        industries: ["Tech"],
        locations: ["NYC"],
        hoursPerWeek: "3-5",
        flags: {},
      },
      fitScores: { CP01: 72 },
      primaryGoal: "CP01",
    };
  }, 120_000);

  afterAll(async () => {
    if (profile?.userId) await db.deleteUser(profile.userId).catch(() => undefined);
  });

  it("golden 1: the pivot question opens an Investment Banking tab grounded in real rows", async () => {
    const { text, calls, ctx } = await ask("How can I pivot into investment banking?");
    const names = calls.map((c) => c.toolName);

    expect(names).toContain("get_skill_gap");
    expect(names).toContain("render_dashboard");
    expect(ctx.renderedTabs[0]?.tab_id).toBe("CP04");

    // The student must actually get an answer, not just a tab.
    expect(text.length).toBeGreaterThan(80);

    // The answer cites real IDs, and every cited ID came back from a tool this turn.
    const cited = guard.referencedIds(text);
    expect(cited.length).toBeGreaterThanOrEqual(3);
    expect(guard.applyOutputGuard(text, ctx.seenIds).invalidIds).toEqual([]);

    // The tab persisted, so a reload restores it (F6).
    const layout = await db.getDashboardLayout(profile.userId);
    const tab = layout.tabs.find((t) => t.tab_id === "CP04");
    expect(tab).toBeDefined();
    expect(tab?.sections.length).toBeGreaterThanOrEqual(3);
  }, 180_000);

  it("golden 2: 'what should I do this week' looks only a week ahead", async () => {
    const { calls } = await ask("What should I do this week?");
    const findEvents = calls.find((c) => c.toolName === "find_events");
    expect(findEvents).toBeDefined();
    const input = findEvents?.input as { days_ahead?: number };
    expect(input.days_ahead ?? 30).toBeLessThanOrEqual(7);
  }, 180_000);

  it("golden 3: 'which banks are coming to VT' uses the recruiter tool", async () => {
    const { calls, text, ctx } = await ask("Which banks are coming to VT soon?");
    expect(calls.map((c) => c.toolName)).toContain("companies_visiting");
    expect(guard.applyOutputGuard(text, ctx.seenIds).invalidIds).toEqual([]);
  }, 180_000);

  it("golden 8: declines an off-topic request", async () => {
    const { text, calls } = await ask("Write my chemistry homework for me.");
    expect(calls).toHaveLength(0);
    // Models use typographic apostrophes, so match both forms.
    expect(text.toLowerCase()).toMatch(/career|can[’']t|cannot|not able|help you with/);
  }, 120_000);

  it("asking about the same path again refreshes the tab instead of duplicating it", async () => {
    await ask("Tell me more about investment banking recruiting.");
    const layout = await db.getDashboardLayout(profile.userId);
    expect(layout.tabs.filter((t) => t.tab_id === "CP04")).toHaveLength(1);
  }, 180_000);
});
