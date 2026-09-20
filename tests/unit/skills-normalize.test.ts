import { describe, expect, it } from "vitest";
import { normalizeSkill, normalizeSkills, normalizeKey } from "@/lib/skills-normalize";
import type { Skill } from "@/lib/types";

// A slice of the real canonical catalog (workspace.hokiepath.skills).
const canonical: Skill[] = [
  "Python",
  "Java",
  "C/C++",
  "JavaScript",
  "React",
  "SQL",
  "Git",
  "Cloud (AWS/Azure/GCP)",
  "Data Structures & Algorithms",
  "Machine Learning",
  "Deep Learning",
  "LLMs & AI Agents",
  "Spark / Databricks",
  "Statistics",
  "Excel Modeling",
  "Financial Modeling",
  "DCF Valuation",
  "LBO Modeling",
  "M&A Concepts",
  "Leadership",
  "Teamwork",
].map((skill_name, i) => ({ skill_id: `SK${i}`, skill_name, category: "Technical" }));

describe("normalizeKey", () => {
  it("lowercases and collapses punctuation", () => {
    expect(normalizeKey("  Investment-Banking!! ")).toBe("investment banking");
  });

  it("keeps characters that distinguish canonical names", () => {
    expect(normalizeKey("C/C++")).toBe("c/c++");
    expect(normalizeKey("Data Structures & Algorithms")).toBe("data structures & algorithms");
  });
});

describe("normalizeSkill", () => {
  it("matches a canonical name exactly, ignoring case", () => {
    expect(normalizeSkill("python", canonical)).toMatchObject({
      name: "Python",
      canonical: true,
      matchedBy: "exact",
    });
  });

  it("resolves common resume aliases", () => {
    expect(normalizeSkill("PyTorch", canonical).name).toBe("Deep Learning");
    expect(normalizeSkill("AWS", canonical).name).toBe("Cloud (AWS/Azure/GCP)");
    expect(normalizeSkill("DSA", canonical).name).toBe("Data Structures & Algorithms");
    expect(normalizeSkill("DCF", canonical).name).toBe("DCF Valuation");
    expect(normalizeSkill("TypeScript", canonical).name).toBe("JavaScript");
  });

  it("loosely matches a canonical name inside a longer phrase", () => {
    expect(normalizeSkill("advanced python scripting", canonical)).toMatchObject({
      name: "Python",
      matchedBy: "loose",
    });
  });

  it("prefers the most specific canonical name", () => {
    expect(normalizeSkill("deep learning research", canonical).name).toBe("Deep Learning");
  });

  it("keeps an unknown skill as a custom skill instead of guessing", () => {
    expect(normalizeSkill("Underwater Basket Weaving", canonical)).toMatchObject({
      name: "Underwater Basket Weaving",
      canonical: false,
      matchedBy: "none",
    });
  });

  it("handles empty input safely", () => {
    expect(normalizeSkill("   ", canonical).canonical).toBe(false);
  });
});

describe("normalizeSkills", () => {
  it("maps a typical CS resume onto canonical names", () => {
    const { skills, unmatched } = normalizeSkills(
      [
        { name: "Python", level_guess: 3, evidence: "Built a Flask API" },
        { name: "Java", level_guess: 3 },
        { name: "SQL", level_guess: 2 },
        { name: "Git", level_guess: 3 },
        { name: "DSA", level_guess: 3 },
      ],
      canonical,
    );
    expect(skills.map((s) => s.name).sort()).toEqual(
      ["Data Structures & Algorithms", "Git", "Java", "Python", "SQL"].sort(),
    );
    expect(skills.every((s) => s.canonical)).toBe(true);
    expect(unmatched).toEqual([]);
  });

  it("de-duplicates aliases of the same canonical skill and keeps the highest level", () => {
    const { skills } = normalizeSkills(
      [
        { name: "python", level_guess: 2 },
        { name: "Python 3", level_guess: 4 },
      ],
      canonical,
    );
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ name: "Python", level: 4 });
  });

  it("clamps out-of-range or missing level guesses", () => {
    const { skills } = normalizeSkills(
      [{ name: "Java", level_guess: 9 }, { name: "SQL", level_guess: 0 }, { name: "Git" }],
      canonical,
    );
    expect(skills.map((s) => s.level)).toEqual([4, 1, 2]);
  });

  it("reports unmatched skills once each", () => {
    const { unmatched } = normalizeSkills(
      [{ name: "Blender" }, { name: "blender" }, { name: "Python" }],
      canonical,
    );
    expect(unmatched).toEqual(["Blender"]);
  });

  it("keeps the evidence sentence for the tooltip", () => {
    const { skills } = normalizeSkills(
      [{ name: "Python", level_guess: 3, evidence: "Built a Flask API" }],
      canonical,
    );
    expect(skills[0]?.evidence).toBe("Built a Flask API");
  });

  it("ignores blank entries", () => {
    const { skills } = normalizeSkills([{ name: "" }, { name: "  " }], canonical);
    expect(skills).toEqual([]);
  });
});
