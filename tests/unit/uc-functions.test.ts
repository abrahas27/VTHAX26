import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/databricks/sql", () => ({
  sql,
  T: (name: string) => `workspace.hokiepath.${name}`,
}));

const { ucFn, UC_FUNCTION_NAMES } = await import("@/lib/databricks/functions");

describe("ucFn", () => {
  beforeEach(() => sql.mockClear());

  it("knows all six seed functions", () => {
    expect(UC_FUNCTION_NAMES).toEqual([
      "list_career_paths",
      "get_skill_gap",
      "build_gap_roadmap",
      "find_events",
      "companies_visiting",
      "find_opportunities",
    ]);
  });

  it("passes arguments positionally as named parameters", async () => {
    await ucFn("find_events", { target_path: "Investment Banking", major: "CS", days_ahead: 45 });
    expect(sql).toHaveBeenCalledWith(
      "SELECT * FROM workspace.hokiepath.find_events(:target_path, :major, :days_ahead)",
      { target_path: "Investment Banking", major: "CS", days_ahead: 45 },
    );
  });

  it("defaults string filters to '' (any) and days_ahead to 30", async () => {
    await ucFn("find_events", { target_path: "Software Engineering" });
    expect(sql).toHaveBeenCalledWith(expect.any(String), {
      target_path: "Software Engineering",
      major: "",
      days_ahead: 30,
    });
  });

  it("emits a no-argument call for list_career_paths", async () => {
    await ucFn("list_career_paths");
    expect(sql).toHaveBeenCalledWith("SELECT * FROM workspace.hokiepath.list_career_paths()", {});
  });

  it("keeps the documented argument order for the roadmap function", async () => {
    await ucFn("build_gap_roadmap", {
      target_path: "Investment Banking",
      student_skills: "Python, SQL",
    });
    expect(sql).toHaveBeenCalledWith(
      "SELECT * FROM workspace.hokiepath.build_gap_roadmap(:target_path, :student_skills, :days_ahead)",
      { target_path: "Investment Banking", student_skills: "Python, SQL", days_ahead: 30 },
    );
  });
});
