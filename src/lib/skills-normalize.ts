// src/lib/skills-normalize.ts : map resume skills onto the canonical `skills` table (spec F2).
// Order: exact (case-insensitive) -> alias map -> loose token match. Anything left over is kept
// as a custom skill rather than guessed at, so the profile never invents a canonical skill.
import type { ProfileSkill, Skill, SkillLevel } from "@/lib/types";

/** Common resume spellings that map to a canonical skill name. Keys are compared normalized. */
export const SKILL_ALIASES: Record<string, string> = {
  py: "Python",
  python3: "Python",
  js: "JavaScript",
  javascript: "JavaScript",
  typescript: "JavaScript",
  ts: "JavaScript",
  node: "JavaScript",
  nodejs: "JavaScript",
  "react.js": "React",
  reactjs: "React",
  nextjs: "React",
  c: "C/C++",
  "c++": "C/C++",
  cpp: "C/C++",
  postgres: "SQL",
  postgresql: "SQL",
  mysql: "SQL",
  sqlite: "SQL",
  github: "Git",
  gitlab: "Git",
  "version control": "Git",
  aws: "Cloud (AWS/Azure/GCP)",
  azure: "Cloud (AWS/Azure/GCP)",
  gcp: "Cloud (AWS/Azure/GCP)",
  "google cloud": "Cloud (AWS/Azure/GCP)",
  cloud: "Cloud (AWS/Azure/GCP)",
  dsa: "Data Structures & Algorithms",
  algorithms: "Data Structures & Algorithms",
  "data structures": "Data Structures & Algorithms",
  "data structures and algorithms": "Data Structures & Algorithms",
  ml: "Machine Learning",
  "ml models": "Machine Learning",
  sklearn: "Machine Learning",
  "scikit learn": "Machine Learning",
  dl: "Deep Learning",
  pytorch: "Deep Learning",
  tensorflow: "Deep Learning",
  "neural networks": "Deep Learning",
  llm: "LLMs & AI Agents",
  llms: "LLMs & AI Agents",
  "generative ai": "LLMs & AI Agents",
  genai: "LLMs & AI Agents",
  "prompt engineering": "LLMs & AI Agents",
  rag: "LLMs & AI Agents",
  spark: "Spark / Databricks",
  pyspark: "Spark / Databricks",
  databricks: "Spark / Databricks",
  matplotlib: "Data Visualization",
  "data viz": "Data Visualization",
  d3: "Data Visualization",
  stats: "Statistics",
  probability: "Statistics",
  tableau: "Tableau / Power BI",
  "power bi": "Tableau / Power BI",
  powerbi: "Tableau / Power BI",
  cybersecurity: "Network Security",
  "cyber security": "Network Security",
  netsec: "Network Security",
  pentesting: "Penetration Testing",
  "pen testing": "Penetration Testing",
  "ethical hacking": "Penetration Testing",
  unix: "Linux",
  bash: "Linux",
  shell: "Linux",
  embedded: "Embedded Systems",
  arduino: "Embedded Systems",
  "raspberry pi": "Embedded Systems",
  solidworks: "CAD (SolidWorks)",
  cad: "CAD (SolidWorks)",
  autocad: "CAD (SolidWorks)",
  matlab: "MATLAB",
  simulink: "MATLAB",
  pcb: "Circuit Design",
  "circuit analysis": "Circuit Design",
  fea: "Structural Analysis",
  ansys: "Structural Analysis",
  "finite element analysis": "Structural Analysis",
  "lab research": "Lab Research Methods",
  research: "Lab Research Methods",
  "wet lab": "Lab Research Methods",
  figma: "Figma",
  sketch: "Figma",
  "ui design": "Figma",
  "ux research": "User Research",
  "usability testing": "User Research",
  excel: "Excel Modeling",
  "microsoft excel": "Excel Modeling",
  "financial models": "Financial Modeling",
  "three statement modeling": "Financial Modeling",
  dcf: "DCF Valuation",
  "discounted cash flow": "DCF Valuation",
  valuation: "DCF Valuation",
  accounting: "Accounting Fundamentals",
  gaap: "Accounting Fundamentals",
  bookkeeping: "Accounting Fundamentals",
  lbo: "LBO Modeling",
  "leveraged buyout": "LBO Modeling",
  "m&a": "M&A Concepts",
  "mergers and acquisitions": "M&A Concepts",
  "equity analysis": "Equity Research",
  "stock pitch": "Equity Research",
  "financial statements": "Financial Statement Analysis",
  audit: "Auditing",
  "internal audit": "Auditing",
  "market sizing": "Market Sizing",
  "case interview": "Case Interviewing",
  casing: "Case Interviewing",
  strategy: "Business Strategy",
  "corporate strategy": "Business Strategy",
  roadmapping: "Product Roadmapping",
  "product roadmap": "Product Roadmapping",
  "product management": "Product Roadmapping",
  "supply chain": "Supply Chain Analytics",
  logistics: "Supply Chain Analytics",
  seo: "Digital Marketing",
  "social media marketing": "Digital Marketing",
  marketing: "Digital Marketing",
  "consumer research": "Market Research",
  "sales experience": "Sales",
  "cold calling": "Sales",
  "stochastic processes": "Stochastic Calculus",
  "ito calculus": "Stochastic Calculus",
  presenting: "Public Speaking",
  presentations: "Public Speaking",
  communication: "Public Speaking",
  networking: "Networking",
  writing: "Technical Writing",
  documentation: "Technical Writing",
  "technical documentation": "Technical Writing",
  "team lead": "Leadership",
  "led a team": "Leadership",
  mentoring: "Leadership",
  collaboration: "Teamwork",
  "team player": "Teamwork",
  "behavioral interviews": "Behavioral Interviewing",
  star: "Behavioral Interviewing",
  agile: "Project Management",
  scrum: "Project Management",
  jira: "Project Management",
  "policy research": "Policy Analysis",
};

/** Lowercase, strip punctuation except & and +, collapse whitespace. */
export function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9&+./ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface NormalizedSkill {
  name: string;
  canonical: boolean;
  matchedBy: "exact" | "alias" | "loose" | "none";
}

/** Resolve one raw skill string against the canonical catalog. */
export function normalizeSkill(raw: string, canonicalSkills: Skill[]): NormalizedSkill {
  const key = normalizeKey(raw);
  if (!key) return { name: raw.trim(), canonical: false, matchedBy: "none" };

  const exact = canonicalSkills.find((s) => normalizeKey(s.skill_name) === key);
  if (exact) return { name: exact.skill_name, canonical: true, matchedBy: "exact" };

  const aliased = SKILL_ALIASES[key];
  if (aliased && canonicalSkills.some((s) => s.skill_name === aliased)) {
    return { name: aliased, canonical: true, matchedBy: "alias" };
  }

  // Loose match: the raw value contains a canonical name, or vice versa ("advanced python
  // scripting" -> Python). Prefer the longest canonical name so "Deep Learning" beats "Learning".
  const loose = canonicalSkills
    .filter((s) => {
      const canon = normalizeKey(s.skill_name);
      return canon.length > 3 && (key.includes(canon) || canon.includes(key));
    })
    .sort((a, b) => b.skill_name.length - a.skill_name.length)[0];
  if (loose) return { name: loose.skill_name, canonical: true, matchedBy: "loose" };

  return { name: raw.trim(), canonical: false, matchedBy: "none" };
}

export interface RawSkill {
  name: string;
  level_guess?: number;
  evidence?: string;
}

const toLevel = (n: number | undefined): SkillLevel => {
  const rounded = Math.round(n ?? 2);
  return (rounded < 1 ? 1 : rounded > 4 ? 4 : rounded) as SkillLevel;
};

/**
 * Normalize a whole extracted skill list, de-duplicating by canonical name and keeping the
 * highest claimed level. Returns the unmatched raw names so the UI can flag them for review.
 */
export function normalizeSkills(
  raw: RawSkill[],
  canonicalSkills: Skill[],
  source: ProfileSkill["source"] = "resume",
): { skills: ProfileSkill[]; unmatched: string[] } {
  const byName = new Map<string, ProfileSkill>();
  // Keyed case-insensitively so "Blender" and "blender" report once, matching how the skills
  // themselves are de-duplicated below.
  const unmatched = new Map<string, string>();

  for (const entry of raw) {
    if (!entry?.name?.trim()) continue;
    const match = normalizeSkill(entry.name, canonicalSkills);
    if (!match.canonical && !unmatched.has(match.name.toLowerCase())) {
      unmatched.set(match.name.toLowerCase(), match.name);
    }

    const existing = byName.get(match.name.toLowerCase());
    const level = toLevel(entry.level_guess);
    if (existing) {
      existing.level = Math.max(existing.level, level) as SkillLevel;
      existing.evidence ??= entry.evidence;
    } else {
      byName.set(match.name.toLowerCase(), {
        name: match.name,
        level,
        evidence: entry.evidence,
        source,
        canonical: match.canonical,
      });
    }
  }

  return { skills: [...byName.values()], unmatched: [...unmatched.values()] };
}
