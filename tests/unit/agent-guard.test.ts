import { beforeEach, describe, expect, it } from "vitest";
import {
  applyOutputGuard,
  rateLimit,
  referencedIds,
  resetRateLimits,
  sanitizeUserMessage,
} from "@/lib/agent/guard";

describe("sanitizeUserMessage", () => {
  it("strips HTML and collapses whitespace", () => {
    expect(sanitizeUserMessage("  <b>How</b>  do I \n pivot? ")).toBe("How do I pivot?");
  });

  it("caps the message at 2000 characters", () => {
    expect(sanitizeUserMessage("a".repeat(5000))).toHaveLength(2000);
  });

  it("removes a script tag entirely", () => {
    expect(sanitizeUserMessage("hi <script>alert(1)</script> there")).toBe("hi alert(1) there");
  });
});

describe("referencedIds", () => {
  it("finds every bracketed item id", () => {
    expect(referencedIds("Start with [EV0037], then [CL001] and [OP0059].")).toEqual([
      "EV0037",
      "CL001",
      "OP0059",
    ]);
  });

  it("ignores text that is not an id", () => {
    expect(referencedIds("[see below] and [Note]")).toEqual([]);
  });

  it("recognizes course codes, which roadmap items use as ids", () => {
    expect(referencedIds("Take FIN 4114 [FIN 4114] and [CS 3114].")).toEqual([
      "FIN 4114",
      "CS 3114",
    ]);
  });
});

describe("applyOutputGuard", () => {
  it("keeps citations that a tool returned this turn", () => {
    const seen = new Set(["EV0037", "CL001"]);
    const text = "Start with [EV0037] then join [CL001].";
    expect(applyOutputGuard(text, seen)).toEqual({ text, invalidIds: [] });
  });

  it("validates course codes against tool output too", () => {
    const result = applyOutputGuard("Take [FIN 4114] and [FIN 9999].", new Set(["FIN 4114"]));
    expect(result.invalidIds).toEqual(["FIN 9999"]);
    expect(result.text).toContain("[FIN 4114]");
  });

  it("removes an invented citation and reports it", () => {
    const result = applyOutputGuard("Try [EV0037] and [EV9999].", new Set(["EV0037"]));
    expect(result.invalidIds).toEqual(["EV9999"]);
    expect(result.text).not.toContain("EV9999");
    expect(result.text).toContain("[EV0037]");
  });

  it("leaves a readable sentence behind", () => {
    const result = applyOutputGuard("Go to [EV9999] on Monday.", new Set());
    expect(result.text).toBe("Go to on Monday.");
  });

  it("returns the text untouched when nothing was cited", () => {
    const text = "You already have strong Python skills.";
    expect(applyOutputGuard(text, new Set()).text).toBe(text);
  });
});

describe("rateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows 20 turns in the window and blocks the 21st", () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) expect(rateLimit("user-1", now + i).ok).toBe(true);
    const blocked = rateLimit("user-1", now + 20);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("forgets hits once the window passes", () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) rateLimit("user-2", now);
    expect(rateLimit("user-2", now + 11 * 60_000).ok).toBe(true);
  });

  it("tracks users separately", () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) rateLimit("user-3", now);
    expect(rateLimit("user-4", now).ok).toBe(true);
  });
});
