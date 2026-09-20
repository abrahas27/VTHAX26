import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {},
  requireEnv: () => ({}),
}));

const { normalizeEndpoint } = await import("@/lib/db/lakebase");

describe("normalizeEndpoint", () => {
  const full = "projects/hireup-db/branches/production/endpoints/primary";

  it("accepts a full resource name", () => {
    expect(normalizeEndpoint(full)).toBe(full);
  });

  it("tolerates surrounding whitespace and slashes", () => {
    expect(normalizeEndpoint(`  /${full}/  `)).toBe(full);
  });

  it("adds a missing projects/ prefix", () => {
    expect(normalizeEndpoint("hireup-db/branches/production/endpoints/primary")).toBe(full);
  });

  it("rejects a bare project id, which is the old instance-style value", () => {
    expect(() => normalizeEndpoint("hireup-db")).toThrow(/LAKEBASE_ENDPOINT must look like/);
  });

  it("rejects a path that is missing the endpoint segment", () => {
    expect(() => normalizeEndpoint("projects/hireup-db/branches/production")).toThrow();
  });
});
