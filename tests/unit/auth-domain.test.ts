import { describe, expect, it, vi } from "vitest";

// Importing the real auth module would construct Auth.js (and need AUTH_* config); only the
// domain rule is under test here.
vi.mock("next-auth", () => ({ default: () => ({}) }));
vi.mock("next-auth/providers/google", () => ({ default: {} }));

const { isAllowedEmail } = await import("@/lib/auth");

describe("isAllowedEmail", () => {
  it("allows any Google account when no domains are configured", () => {
    expect(isAllowedEmail("someone@gmail.com", [])).toBe(true);
  });

  it("restricts to the configured domains", () => {
    expect(isAllowedEmail("hokie@vt.edu", ["vt.edu"])).toBe(true);
    expect(isAllowedEmail("someone@gmail.com", ["vt.edu"])).toBe(false);
  });

  it("ignores case", () => {
    expect(isAllowedEmail("Hokie@VT.edu", ["vt.edu"])).toBe(true);
  });

  it("does not match a domain that is only a suffix of the real one", () => {
    expect(isAllowedEmail("attacker@notvt.edu", ["vt.edu"])).toBe(false);
  });

  it("rejects a missing email", () => {
    expect(isAllowedEmail(undefined, [])).toBe(false);
    expect(isAllowedEmail(null, ["vt.edu"])).toBe(false);
  });
});
