import { describe, expect, it } from "vitest";
import { classYearFrom, matchMajor } from "@/lib/resume";

// Fall term of 2026: the academic year that started July 2026.
const fall2026 = new Date("2026-09-19T12:00:00Z");

describe("classYearFrom", () => {
  it("places a May 2029 graduate in their sophomore year", () => {
    expect(classYearFrom("2029-05", fall2026)).toBe("Sophomore");
  });

  it("places a May 2028 graduate in their junior year", () => {
    expect(classYearFrom("2028-05", fall2026)).toBe("Junior");
  });

  it("places a May 2027 graduate in their senior year", () => {
    expect(classYearFrom("2027-05", fall2026)).toBe("Senior");
  });

  it("treats a December graduation as finishing that same academic year", () => {
    expect(classYearFrom("2026-12", fall2026)).toBe("Senior");
  });

  it("calls a far-off graduation a freshman", () => {
    expect(classYearFrom("2030-05", fall2026)).toBe("Freshman");
  });

  it("uses the previous academic year during the spring term", () => {
    // In March 2027 the academic year still began in July 2026.
    expect(classYearFrom("2029-05", new Date("2027-03-01T12:00:00Z"))).toBe("Sophomore");
  });

  it("returns null for a missing or malformed date so the model's answer can stand", () => {
    expect(classYearFrom(null, fall2026)).toBeNull();
    expect(classYearFrom("May 2029", fall2026)).toBeNull();
    expect(classYearFrom("2029-13", fall2026)).toBeNull();
  });
});

describe("matchMajor", () => {
  const majors = [
    { major_code: "CS", major_name: "Computer Science" },
    { major_code: "FIN", major_name: "Finance" },
    { major_code: "ME", major_name: "Mechanical Engineering" },
  ];

  it("matches a full major name", () => {
    expect(matchMajor("Computer Science", majors)).toBe("CS");
  });

  it("matches a major code", () => {
    expect(matchMajor("cs", majors)).toBe("CS");
  });

  it("matches a longer phrase containing the major", () => {
    expect(matchMajor("B.S. in Mechanical Engineering", majors)).toBe("ME");
  });

  it("returns null when nothing matches", () => {
    expect(matchMajor("Basket Weaving", majors)).toBeNull();
    expect(matchMajor(null, majors)).toBeNull();
  });
});
