import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/databricks/sql", () => ({
  sql,
  T: (name: string) => `workspace.hokiepath.${name}`,
}));

const vectorSearchConfigured = vi.fn().mockReturnValue(false);
const vsQuery = vi.fn();
vi.mock("@/lib/databricks/vector", () => ({ vectorSearchConfigured, vsQuery }));

vi.mock("@/lib/env", () => ({
  env: { DATABRICKS_VS_EVENTS_INDEX: "events_idx", DATABRICKS_VS_OPPS_INDEX: "opps_idx" },
}));

const { search } = await import("@/lib/search");

describe("search", () => {
  beforeEach(() => {
    sql.mockClear();
    sql.mockResolvedValue([]);
    vectorSearchConfigured.mockReset().mockReturnValue(false);
    vsQuery.mockReset();
  });

  it("falls back to SQL ILIKE when Vector Search is not configured", async () => {
    await search("learn valuation");
    expect(vsQuery).not.toHaveBeenCalled();
    // events + opportunities + clubs = 3 ILIKE queries
    expect(sql).toHaveBeenCalledTimes(3);
    const eventQuery = sql.mock.calls.find(([stmt]) =>
      String(stmt).includes("gold_event_search_docs"),
    );
    expect(eventQuery?.[0]).toContain("lower(search_text) LIKE lower(concat('%', :q, '%'))");
    expect(eventQuery?.[1]).toEqual({ q: "learn valuation" });
  });

  it("uses Vector Search when configured, and never falls back on success", async () => {
    vectorSearchConfigured.mockReturnValue(true);
    vsQuery.mockResolvedValueOnce([{ event_id: "EV0001", title: "DCF Workshop" }]); // events
    vsQuery.mockResolvedValueOnce([]); // opportunities

    const result = await search("learn valuation");
    expect(vsQuery).toHaveBeenCalledTimes(2);
    // clubs always run through SQL (no gold search doc / index for clubs).
    expect(sql).toHaveBeenCalledTimes(1);
    expect(result.usedVectorSearch).toBe(true);
    expect(result.events[0]?.id).toBe("EV0001");
  });

  it("falls back to ILIKE for a kind whose Vector Search query throws", async () => {
    vectorSearchConfigured.mockReturnValue(true);
    vsQuery.mockRejectedValueOnce(new Error("endpoint offline"));

    const result = await search("learn valuation", { opportunities: false, clubs: false });
    expect(sql).toHaveBeenCalledTimes(1); // the ILIKE fallback for events
    expect(result.usedVectorSearch).toBe(false);
  });

  it("only queries the kinds requested", async () => {
    await search("valuation", { events: true, opportunities: false, clubs: false });
    expect(sql).toHaveBeenCalledTimes(1);
  });
});
