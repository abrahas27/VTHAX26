import { describe, expect, it } from "vitest";
import { daysUntil, eventTypeLabel, formatEventTime, urgency } from "@/lib/format";

describe("formatEventTime", () => {
  it("renders an ISO timestamp in Eastern time", () => {
    // 17:00 UTC on Sep 21 2026 is 1:00 PM EDT.
    expect(formatEventTime("2026-09-21T17:00:00.000Z")).toBe("Mon, Sep 21, 1:00 PM");
  });

  it("returns an empty string for an unparseable value", () => {
    expect(formatEventTime("not-a-date")).toBe("");
  });
});

describe("daysUntil", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  it("counts whole days ahead", () => {
    expect(daysUntil("2026-09-21T12:00:00Z", now)).toBe(2);
  });
  it("goes negative for past dates", () => {
    expect(daysUntil("2026-09-18T12:00:00Z", now)).toBe(-1);
  });
});

describe("urgency", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  it("flags deadlines inside 3 days as urgent", () => {
    expect(urgency("2026-09-21T12:00:00Z", now)).toBe("urgent");
  });
  it("flags deadlines inside 14 days as soon", () => {
    expect(urgency("2026-09-30T12:00:00Z", now)).toBe("soon");
  });
  it("leaves distant and missing deadlines unflagged", () => {
    expect(urgency("2026-12-01T12:00:00Z", now)).toBe("none");
    expect(urgency(null, now)).toBe("none");
  });
  it("does not flag a deadline that has already passed", () => {
    expect(urgency("2026-09-01T12:00:00Z", now)).toBe("none");
  });
});

describe("eventTypeLabel", () => {
  it("uses friendly labels for known types", () => {
    expect(eventTypeLabel("technical_workshop")).toBe("Workshop");
    expect(eventTypeLabel("coffee_chat")).toBe("Coffee chat");
  });
  it("title-cases unknown types", () => {
    expect(eventTypeLabel("alumni_mixer")).toBe("Alumni Mixer");
  });
});
