import { describe, expect, it } from "vitest";
import {
  collectIds,
  DashboardSpecSchema,
  pruneUnknownIds,
  upsertTab,
  type DashboardSpec,
} from "@/lib/agent/dashboard-spec";

const spec = (over: Partial<DashboardSpec> = {}): DashboardSpec => ({
  tab_id: "CP04",
  title: "Investment Banking",
  source_question: "How can I pivot into investment banking?",
  sections: [
    { type: "readiness" },
    { type: "skill_gap" },
    { type: "event_list", title: "IB events", event_ids: ["EV0037", "EV0042"] },
    { type: "club_grid", club_ids: ["CL001"] },
    { type: "opportunity_list", opportunity_ids: ["OP0058"] },
    { type: "company_radar", title: "Banks coming to VT", visit_event_ids: ["EV0002"] },
  ],
  ...over,
});

describe("DashboardSpecSchema", () => {
  it("accepts a well-formed spec", () => {
    expect(DashboardSpecSchema.safeParse(spec()).success).toBe(true);
  });

  it("requires tab_id to be a path id, so one tab exists per path", () => {
    expect(DashboardSpecSchema.safeParse(spec({ tab_id: "investment-banking" })).success).toBe(
      false,
    );
  });

  it("requires between 3 and 8 sections", () => {
    expect(DashboardSpecSchema.safeParse(spec({ sections: [{ type: "readiness" }] })).success).toBe(
      false,
    );
  });

  it("rejects an unknown section type", () => {
    const bad = { ...spec(), sections: [...spec().sections, { type: "iframe", src: "x" }] };
    expect(DashboardSpecSchema.safeParse(bad).success).toBe(false);
  });

  it("caps free text on the one section that allows it", () => {
    const bad = spec({
      sections: [
        { type: "readiness" },
        { type: "skill_gap" },
        { type: "insight", markdown: "x".repeat(601) },
      ],
    });
    expect(DashboardSpecSchema.safeParse(bad).success).toBe(false);
  });
});

describe("collectIds", () => {
  it("groups ids by the catalog table that can confirm them", () => {
    expect(collectIds(spec())).toEqual({
      events: ["EV0037", "EV0042", "EV0002"],
      clubs: ["CL001"],
      opportunities: ["OP0058"],
    });
  });
});

describe("pruneUnknownIds", () => {
  it("drops ids the catalog does not know and reports them", () => {
    const withBogus = spec({
      sections: [
        { type: "readiness" },
        { type: "skill_gap" },
        { type: "event_list", title: "IB events", event_ids: ["EV0037", "EV9999"] },
      ],
    });
    const { spec: cleaned, dropped } = pruneUnknownIds(withBogus, {
      events: new Set(["EV0037"]),
      clubs: new Set(),
      opportunities: new Set(),
    });
    expect(dropped).toEqual(["EV9999"]);
    const section = cleaned.sections[2];
    expect(section?.type === "event_list" && section.event_ids).toEqual(["EV0037"]);
  });

  it("leaves computed sections alone", () => {
    const { spec: cleaned, dropped } = pruneUnknownIds(spec(), {
      events: new Set(["EV0037", "EV0042", "EV0002"]),
      clubs: new Set(["CL001"]),
      opportunities: new Set(["OP0058"]),
    });
    expect(dropped).toEqual([]);
    expect(cleaned.sections[0]).toEqual({ type: "readiness" });
  });
});

describe("upsertTab", () => {
  it("adds a new tab", () => {
    expect(upsertTab({ tabs: [] }, spec()).tabs).toHaveLength(1);
  });

  it("refreshes an existing tab in place instead of duplicating it", () => {
    const first = upsertTab({ tabs: [] }, spec());
    const second = upsertTab(first, spec({ source_question: "asked again" }));
    expect(second.tabs).toHaveLength(1);
    expect(second.tabs[0]?.source_question).toBe("asked again");
  });

  it("keeps tab order stable so reloads look the same", () => {
    const layout = upsertTab(
      upsertTab({ tabs: [] }, spec()),
      spec({ tab_id: "CP01", title: "SWE" }),
    );
    const refreshed = upsertTab(layout, spec({ source_question: "again" }));
    expect(refreshed.tabs.map((t) => t.tab_id)).toEqual(["CP04", "CP01"]);
  });
});
