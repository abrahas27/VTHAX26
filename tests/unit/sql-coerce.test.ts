import { describe, expect, it } from "vitest";
import { coerce, rowsFrom } from "@/lib/databricks/sql";

describe("coerce", () => {
  it("keeps nulls as null whatever the column type", () => {
    expect(coerce(null, "STRING")).toBeNull();
    expect(coerce(null, "ARRAY")).toBeNull();
  });

  it("turns numeric column types into numbers", () => {
    expect(coerce("280", "LONG")).toBe(280);
    expect(coerce("41", "INT")).toBe(41);
    expect(coerce("0.92", "DOUBLE")).toBe(0.92);
    expect(coerce("132270", "DECIMAL")).toBe(132270);
  });

  it("falls back to the raw text when a numeric value will not parse", () => {
    expect(coerce("not-a-number", "INT")).toBe("not-a-number");
  });

  it("parses booleans", () => {
    expect(coerce("true", "BOOLEAN")).toBe(true);
    expect(coerce("false", "BOOLEAN")).toBe(false);
  });

  it("parses arrays, structs, and maps from JSON text", () => {
    expect(coerce('["Python","SQL"]', "ARRAY")).toEqual(["Python", "SQL"]);
    expect(coerce('{"a":1}', "STRUCT")).toEqual({ a: 1 });
    expect(coerce('{"k":"v"}', "MAP")).toEqual({ k: "v" });
  });

  it("returns malformed JSON as text rather than throwing", () => {
    expect(coerce("[oops", "ARRAY")).toBe("[oops");
  });

  it("leaves strings, dates, and timestamps as ISO text", () => {
    expect(coerce("EV0037", "STRING")).toBe("EV0037");
    expect(coerce("2026-09-21", "DATE")).toBe("2026-09-21");
    expect(coerce("2026-09-21T18:00:00", "TIMESTAMP")).toBe("2026-09-21T18:00:00");
  });

  it("matches type names case-insensitively", () => {
    expect(coerce("7", "int")).toBe(7);
  });
});

describe("rowsFrom", () => {
  it("zips the manifest columns with each data row", () => {
    const rows = rowsFrom({
      statement_id: "x",
      status: { state: "SUCCEEDED" },
      manifest: {
        schema: {
          columns: [
            { name: "event_id", type_name: "STRING" },
            { name: "capacity", type_name: "INT" },
            { name: "related_skills", type_name: "ARRAY" },
          ],
        },
      },
      result: { data_array: [["EV0037", "40", '["DCF Valuation"]']] },
    });
    expect(rows).toEqual([{ event_id: "EV0037", capacity: 40, related_skills: ["DCF Valuation"] }]);
  });

  it("returns an empty array when a statement produced no rows", () => {
    expect(rowsFrom({ statement_id: "x", status: { state: "SUCCEEDED" } })).toEqual([]);
  });
});
