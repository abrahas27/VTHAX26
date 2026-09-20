import { describe, expect, it } from "vitest";
import { toClub, toEvent, toOpportunity } from "@/lib/dashboard";
import { eventTypeLabel, opportunityTypeLabel } from "@/lib/format";

// Rows exactly as Unity Catalog returns them (verified against the live warehouse).
const opportunityRow = {
  opportunity_id: "OP0058",
  title: "Investment Banking Summer Analyst",
  opportunity_type: "internship",
  company_name: "Bank of America",
  path_name: "Investment Banking",
  required_skills: ["Financial Modeling", "DCF Valuation"],
  class_years: ["Sophomore", "Junior"],
  location: "Charlotte, NC",
  deadline: "2026-10-13",
};

describe("toOpportunity", () => {
  it("maps catalog column names onto the fields the cards render", () => {
    expect(toOpportunity(opportunityRow)).toEqual({
      id: "OP0058",
      title: "Investment Banking Summer Analyst",
      type: "internship",
      companyName: "Bank of America",
      pathName: "Investment Banking",
      requiredSkills: ["Financial Modeling", "DCF Valuation"],
      classYears: ["Sophomore", "Junior"],
      location: "Charlotte, NC",
      deadline: "2026-10-13",
      applyUrl: null,
    });
  });

  it("never leaves `type` undefined, which previously crashed the goal tab", () => {
    // A row hydrated by /api/items/batch must carry `type`, not `opportunity_type`.
    const mapped = toOpportunity(opportunityRow);
    expect(mapped.type).toBeDefined();
    expect(() => opportunityTypeLabel(mapped.type)).not.toThrow();
  });

  it("defaults array columns that arrive null", () => {
    const mapped = toOpportunity({ ...opportunityRow, required_skills: null, class_years: null });
    expect(mapped.requiredSkills).toEqual([]);
    expect(mapped.classYears).toEqual([]);
  });
});

describe("toEvent / toClub", () => {
  it("maps an event row onto the card shape", () => {
    const event = toEvent({
      event_id: "EV0037",
      title: "J.P. Morgan Workshop",
      event_type: "technical_workshop",
      start_ts: "2026-09-21T17:00:00.000Z",
      location: "Owens Banquet Hall",
      host_name: "J.P. Morgan",
      company_name: "J.P. Morgan",
      path_names: ["Investment Banking"],
      related_skills: ["DCF Valuation"],
    });
    expect(event).toMatchObject({ id: "EV0037", type: "technical_workshop", isVirtual: false });
    expect(eventTypeLabel(event.type)).toBe("Workshop");
  });

  it("falls back when optional event columns are null", () => {
    const event = toEvent({
      event_id: "EV0269",
      title: "Networking for Introverts",
      event_type: "workshop",
      start_ts: "2026-09-24T16:00:00.000Z",
      location: null,
      host_name: null,
      company_name: null,
      path_names: null,
      related_skills: null,
    });
    expect(event.location).toBe("TBA");
    expect(event.host).toBe("Virginia Tech");
    expect(event.pathNames).toEqual([]);
  });

  it("maps a club row onto the card shape", () => {
    expect(
      toClub({
        club_id: "CL001",
        club_name: "COINS",
        category: "Finance",
        meeting_day: "Tuesday",
        meeting_time: "19:30",
        skills_developed: ["DCF Valuation"],
        description: "Student investment group.",
        gobblerconnect_url: "https://gobblerconnect.vt.edu/",
        application_required: true,
      }),
    ).toMatchObject({ id: "CL001", name: "COINS", meetingDay: "Tuesday" });
  });
});

describe("label helpers tolerate missing data", () => {
  it("returns a neutral label instead of throwing", () => {
    expect(eventTypeLabel(undefined)).toBe("Event");
    expect(eventTypeLabel(null)).toBe("Event");
    expect(opportunityTypeLabel(undefined)).toBe("Opportunity");
    expect(opportunityTypeLabel("")).toBe("Opportunity");
  });
});
