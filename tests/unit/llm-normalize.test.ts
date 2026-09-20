import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: {}, requireEnv: () => ({}) }));

const { flattenContent } = await import("@/lib/databricks/llm");

describe("flattenContent", () => {
  it("passes strings through unchanged (Llama-style responses)", () => {
    expect(flattenContent("hello from HokiePath")).toBe("hello from HokiePath");
    expect(flattenContent("")).toBe("");
  });

  it("keeps null for tool-call-only messages", () => {
    expect(flattenContent(null)).toBeNull();
    expect(flattenContent(undefined)).toBeNull();
  });

  it("drops reasoning blocks and keeps the final text (gpt-oss-style)", () => {
    const content = [
      {
        type: "reasoning",
        summary: [{ type: "summary_text", text: "The user wants a greeting." }],
      },
      { type: "text", text: "hello from HokiePath" },
    ];
    expect(flattenContent(content)).toBe("hello from HokiePath");
  });

  it("returns an empty string when a chunk carries reasoning only", () => {
    const content = [{ type: "reasoning", summary: [{ type: "summary_text", text: "We need" }] }];
    expect(flattenContent(content)).toBe("");
  });

  it("joins several text blocks in order", () => {
    const content = [
      { type: "text", text: '{"name":' },
      { type: "reasoning", summary: [] },
      { type: "text", text: '"Jane Hokie"}' },
    ];
    expect(flattenContent(content)).toBe('{"name":"Jane Hokie"}');
  });

  it("never leaks reasoning text into the answer", () => {
    const secret = "internal scratchpad";
    const out = flattenContent([
      { type: "reasoning", summary: [{ type: "summary_text", text: secret }], text: secret },
      { type: "text", text: "final" },
    ]);
    expect(out).toBe("final");
    expect(out).not.toContain(secret);
  });
});
