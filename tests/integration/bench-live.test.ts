// Step-level latency measurement for the P5 performance pass (spec 6.4). Not an assertion suite:
// it times every external call the hot routes make and prints a table.
//   RUN_LIVE=1 BENCH=1 pnpm vitest run tests/integration/bench-live.test.ts
// BENCH=1 (rather than RUN_LIVE alone) keeps it out of the normal live run, which is a test suite.
import { beforeAll, describe, it } from "vitest";

const live = process.env.RUN_LIVE === "1" && process.env.BENCH === "1";
const LABEL = process.env.BENCH_LABEL ?? "run";

const PATH = "Software Engineering";
const SKILLS = "Python, SQL, Java, Git, React";

describe.skipIf(!live)(`bench ${LABEL}`, () => {
  let sql: typeof import("@/lib/databricks/sql").sql;
  let warehouseState: typeof import("@/lib/databricks/sql").warehouseState;
  let ucFn: typeof import("@/lib/databricks/functions").ucFn;
  let catalog: typeof import("@/lib/catalog");
  let q: typeof import("@/lib/db/lakebase").q;
  let search: typeof import("@/lib/search").search;

  const rows: { step: string; ms: number; note: string }[] = [];

  async function time(step: string, fn: () => Promise<unknown>) {
    const t0 = performance.now();
    let note = "";
    try {
      const out = await fn();
      note = Array.isArray(out) ? `${out.length} rows` : "ok";
    } catch (err) {
      note = `FAILED: ${err instanceof Error ? err.message.slice(0, 90) : String(err)}`;
    }
    const ms = Math.round(performance.now() - t0);
    rows.push({ step, ms, note });
    console.log(`  ${step.padEnd(36)} ${String(ms).padStart(6)} ms  ${note}`);
    return ms;
  }

  beforeAll(async () => {
    const preset = { ...process.env };
    process.loadEnvFile?.(".env.local");
    Object.assign(process.env, preset);
    ({ sql, warehouseState } = await import("@/lib/databricks/sql"));
    ({ ucFn } = await import("@/lib/databricks/functions"));
    catalog = await import("@/lib/catalog");
    ({ q } = await import("@/lib/db/lakebase"));
    ({ search } = await import("@/lib/search"));
  }, 120_000);

  it("measures every external step", async () => {
    console.log(`\n=== bench "${LABEL}" | warehouse ${await warehouseState()} ===`);

    console.log("\n-- primitives --");
    await time("sql:SELECT 1 (first, may be cold)", () => sql("SELECT 1 AS one"));
    await time("sql:SELECT 1 (warm)", () => sql("SELECT 1 AS one"));
    await time("lakebase:first query (cred+pool)", () => q("SELECT 1 AS one"));
    await time("lakebase:second query", () => q("SELECT 1 AS one"));

    console.log("\n-- catalog --");
    catalog.clearCatalogCache();
    await time("catalog:career_paths (uncached)", catalog.careerPaths);
    await time("catalog:path_skills (uncached)", catalog.pathSkills);
    await time("catalog:skills (uncached)", catalog.skills);
    await time("catalog:majors (uncached)", catalog.majors);
    await time("catalog:career_paths (cached)", catalog.careerPaths);

    console.log("\n-- UC functions, one at a time --");
    const serial0 = performance.now();
    await time("uc:find_events", () =>
      ucFn("find_events", { target_path: PATH, major: "", days_ahead: 60 }),
    );
    await time("uc:companies_visiting", () =>
      ucFn("companies_visiting", { target_path: PATH, days_ahead: 45 }),
    );
    await time("uc:find_opportunities", () =>
      ucFn("find_opportunities", { target_path: PATH, opp_type: "" }),
    );
    await time("uc:build_gap_roadmap", () =>
      ucFn("build_gap_roadmap", {
        target_path: PATH,
        student_skills: SKILLS,
        days_ahead: 90,
      }),
    );
    await time("uc:get_skill_gap", () =>
      ucFn("get_skill_gap", { target_path: PATH, student_skills: SKILLS }),
    );
    await time("sql:clubs for path", () =>
      sql(
        "SELECT club_id FROM workspace.hokiepath.clubs WHERE array_contains(career_paths, :pid) LIMIT 6",
        { pid: "CP01" },
      ),
    );
    console.log(
      `  ${"(serial sum)".padEnd(36)} ${String(Math.round(performance.now() - serial0)).padStart(6)} ms`,
    );

    console.log("\n-- the same six in parallel (buildDashboard's fan-out) --");
    await time("dashboard:6 calls in parallel", () =>
      Promise.all([
        ucFn("find_events", { target_path: PATH, major: "", days_ahead: 60 }),
        ucFn("companies_visiting", { target_path: PATH, days_ahead: 45 }),
        ucFn("find_opportunities", { target_path: PATH, opp_type: "" }),
        ucFn("build_gap_roadmap", {
          target_path: PATH,
          student_skills: SKILLS,
          days_ahead: 90,
        }),
        ucFn("get_skill_gap", { target_path: PATH, student_skills: SKILLS }),
        sql(
          "SELECT club_id FROM workspace.hokiepath.clubs WHERE array_contains(career_paths, :pid) LIMIT 6",
          { pid: "CP01" },
        ),
      ]),
    );

    console.log("\n-- the core five, without the roadmap (what first paint waits for now) --");
    await time("dashboard:core 5 in parallel", () =>
      Promise.all([
        ucFn("find_events", { target_path: PATH, major: "", days_ahead: 60 }),
        ucFn("companies_visiting", { target_path: PATH, days_ahead: 45 }),
        ucFn("find_opportunities", { target_path: PATH, opp_type: "" }),
        ucFn("get_skill_gap", { target_path: PATH, student_skills: SKILLS }),
        sql(
          "SELECT club_id FROM workspace.hokiepath.clubs WHERE array_contains(career_paths, :pid) LIMIT 6",
          { pid: "CP01" },
        ),
      ]),
    );

    console.log("\n-- search --");
    await time("search:all kinds", () => search("learn valuation", { k: 8 }));
    await time("search:events only", () =>
      search("learn valuation", { events: true, opportunities: false, clubs: false, k: 8 }),
    );

    console.log("\n-- items/batch --");
    await time("sql:hydrate 3 events by id", () =>
      sql(
        "SELECT event_id, title FROM workspace.hokiepath.gold_events_enriched WHERE event_id IN (SELECT explode(from_json(:ids,'array<string>')))",
        { ids: JSON.stringify(["EV0001", "EV0002", "EV0003"]) },
      ),
    );

    console.log("\n-- LLM --");
    await time("llm:chat stream (ttft printed below)", async () => {
      const { streamText } = await import("ai");
      const { chatModel } = await import("@/lib/databricks/llm");
      const res = streamText({
        model: chatModel(),
        prompt: "Name three skills an investment banking analyst needs. One line each.",
        temperature: 0.3,
        maxOutputTokens: 120,
      });
      const t0 = performance.now();
      let first = -1;
      for await (const _chunk of res.textStream) {
        if (first < 0) first = Math.round(performance.now() - t0);
      }
      console.log(`  ${"llm:time to first token".padEnd(36)} ${String(first).padStart(6)} ms`);
      rows.push({ step: "llm:time to first token", ms: first, note: "ok" });
      return "ok";
    });

    console.log("\n-- agent: a full pivot turn --");
    {
      const { streamText, stepCountIs } = await import("ai");
      const { chatModel } = await import("@/lib/databricks/llm");
      const { buildTools } = await import("@/lib/agent/tools");
      const { systemPrompt } = await import("@/lib/agent/system-prompt");
      const paths = await catalog.careerPaths();
      const pathNames = Object.fromEntries(paths.map((p) => [p.path_id, p.path_name]));
      const profile: import("@/lib/types").SkillProfile = {
        userId: "00000000-0000-0000-0000-000000000000",
        displayName: "Priya",
        majorCode: "CS",
        classYear: "Sophomore",
        skills: [
          { name: "Python", level: 3, source: "resume", canonical: true },
          { name: "Java", level: 3, source: "resume", canonical: true },
          { name: "SQL", level: 2, source: "resume", canonical: true },
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
      // render_dashboard writes to Lakebase for a real user; this bench profile has no row, so it
      // is left out and the measurement covers the data tools plus the written answer.
      const { render_dashboard: _skip, ...dataTools } = buildTools({
        profile,
        seenIds: new Set(),
        renderedTabs: [],
      });

      const t0 = performance.now();
      const res = streamText({
        model: chatModel(),
        system: systemPrompt(profile, pathNames),
        prompt: "How can I pivot into investment banking?",
        tools: dataTools,
        stopWhen: stepCountIs(8),
        temperature: 0.3,
        maxOutputTokens: 1500,
        providerOptions: (await import("@/lib/databricks/llm")).LOW_REASONING,
      });
      let first = -1;
      for await (const _chunk of res.textStream) {
        if (first < 0) first = Math.round(performance.now() - t0);
      }
      const total = Math.round(performance.now() - t0);
      const steps = await res.steps;
      const calls = steps.flatMap((step) => step.toolCalls).map((c) => c.toolName);
      const answer = await res.text;
      const ids = [...answer.matchAll(/\[([A-Z]{2}\d{3,4})\]/g)].map((m) => m[1]);
      console.log(`  ${"agent:answer chars".padEnd(36)} ${String(answer.length).padStart(6)}`);
      console.log(
        `  ${"agent:grounded ids cited".padEnd(36)} ${String(ids.length).padStart(6)}     ${ids.join(", ")}`,
      );
      console.log(`  ${"agent:time to first token".padEnd(36)} ${String(first).padStart(6)} ms`);
      console.log(`  ${"agent:total".padEnd(36)} ${String(total).padStart(6)} ms`);
      console.log(
        `  ${"agent:tool calls".padEnd(36)} ${String(calls.length).padStart(6)}     ${calls.join(", ")}`,
      );
      rows.push({ step: "agent:time to first token", ms: first, note: calls.join("|") });
      rows.push({ step: "agent:total", ms: total, note: `${steps.length} steps` });
    }

    console.log(`\n=== end "${LABEL}" ===`);
    console.log(JSON.stringify({ label: LABEL, rows }));
  }, 600_000);
});
