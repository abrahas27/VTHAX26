// Opt-in live checks against Databricks model serving: RUN_LIVE=1 pnpm test
// Skipped by default so CI and teammates without secrets can still run the suite.
import { describe, expect, it, beforeAll } from "vitest";

const live = process.env.RUN_LIVE === "1";

describe.skipIf(!live)("Databricks model serving (live)", () => {
  let generateText: typeof import("ai").generateText;
  let generateObject: typeof import("ai").generateObject;
  let chatModel: typeof import("@/lib/databricks/llm").chatModel;
  let embedModel: typeof import("@/lib/databricks/llm").embedModel;
  let tool: typeof import("ai").tool;
  let stepCountIs: typeof import("ai").stepCountIs;
  let embed: typeof import("ai").embed;
  let z: typeof import("zod").z;

  beforeAll(async () => {
    // Keep variables that were set on the command line (e.g. to try another endpoint).
    const preset = { ...process.env };
    process.loadEnvFile?.(".env.local");
    Object.assign(process.env, preset);
    console.log("live endpoint:", process.env.DATABRICKS_LLM_ENDPOINT);
    ({ generateText, generateObject, tool, stepCountIs, embed } = await import("ai"));
    ({ chatModel, embedModel } = await import("@/lib/databricks/llm"));
    ({ z } = await import("zod"));
  });

  it("returns plain text with no reasoning leakage", async () => {
    const { text } = await generateText({
      model: chatModel(),
      prompt: "Reply with exactly: hello from HokiePath",
      maxOutputTokens: 200,
    });
    expect(text.toLowerCase()).toContain("hello from hokiepath");
    expect(text.toLowerCase()).not.toContain("the user wants");
  }, 60_000);

  it("produces a schema-valid object for resume extraction", async () => {
    const { object } = await generateObject({
      model: chatModel(),
      schema: z.object({
        name: z.string(),
        major: z.string(),
        skills: z.array(z.string()),
      }),
      prompt: 'Extract from: "Jane Hokie, Computer Science sophomore, Python and SQL."',
      maxOutputTokens: 400,
    });
    expect(object.name).toMatch(/Jane/);
    expect(object.skills.map((s) => s.toLowerCase())).toContain("python");
  }, 60_000);

  it("calls a tool and uses its result", async () => {
    const { steps, text } = await generateText({
      model: chatModel(),
      tools: {
        find_events: tool({
          description: "Find upcoming Virginia Tech events for a career path.",
          inputSchema: z.object({ target_path: z.string(), days_ahead: z.number().default(30) }),
          execute: async () => [{ event_id: "EV0037", title: "J.P. Morgan IB Workshop" }],
        }),
      },
      stopWhen: stepCountIs(4),
      prompt: "Which investment banking events are coming up? Name the event you find.",
      maxOutputTokens: 400,
    });
    const calls = steps.flatMap((s) => s.toolCalls);
    expect(calls.map((c) => c.toolName)).toContain("find_events");
    expect(text).toMatch(/J\.?P\.? Morgan/i);
  }, 90_000);

  it("embeds text", async () => {
    const { embedding } = await embed({ model: embedModel(), value: "learn company valuation" });
    expect(embedding.length).toBeGreaterThan(100);
  }, 60_000);
});
