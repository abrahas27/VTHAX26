import { describe, expect, it } from "vitest";
import { buildIcs, toEventAttributes } from "@/lib/ics";
import type { EventItem } from "@/lib/types";

const event: EventItem = {
  id: "EV0037",
  title: "J.P. Morgan Workshop",
  type: "technical_workshop",
  start: "2026-09-21T17:00:00.000Z",
  location: "Owens Banquet Hall",
  host: "J.P. Morgan",
  companyName: "J.P. Morgan",
  pathNames: ["Investment Banking"],
  skills: ["DCF Valuation"],
  isVirtual: false,
};

describe("toEventAttributes", () => {
  it("encodes the start time as UTC so every calendar app converts it correctly (spec F10)", () => {
    const attrs = toEventAttributes(event, "https://hokiepath.vercel.app");
    expect(attrs.start).toEqual([2026, 9, 21, 17, 0]);
    expect(attrs.startInputType).toBe("utc");
    expect(attrs.startOutputType).toBe("utc");
  });

  it("defaults a one-hour block when the event has no end time", () => {
    const attrs = toEventAttributes(event, "https://hokiepath.vercel.app");
    expect("end" in attrs && attrs.end).toEqual([2026, 9, 21, 18, 0]);
  });

  it("uses the event's own end time when present", () => {
    const withEnd = { ...event, end: "2026-09-21T19:30:00.000Z" };
    const attrs = toEventAttributes(withEnd, "https://hokiepath.vercel.app");
    expect("end" in attrs && attrs.end).toEqual([2026, 9, 21, 19, 30]);
  });

  it("includes a link back to HokiePath and the event id in the uid", () => {
    const attrs = toEventAttributes(event, "https://hokiepath.vercel.app");
    expect(attrs.url).toBe("https://hokiepath.vercel.app/dashboard");
    expect(attrs.uid).toBe("EV0037@hokiepath");
  });
});

describe("buildIcs", () => {
  it("produces a valid VCALENDAR with a Zulu DTSTART", () => {
    const result = buildIcs([event], "https://hokiepath.vercel.app");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toContain("BEGIN:VCALENDAR");
    expect(result.value).toContain("BEGIN:VEVENT");
    expect(result.value).toMatch(/DTSTART.*:20260921T170000Z/);
    expect(result.value).toContain("SUMMARY:J.P. Morgan Workshop");
  });

  it("fails gracefully on an empty event list rather than emitting an empty calendar", () => {
    const result = buildIcs([], "https://hokiepath.vercel.app");
    expect(result.ok).toBe(false);
  });
});
