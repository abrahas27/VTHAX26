// src/lib/catalog.ts : cached Unity Catalog lookups (paths, skills, majors, path_skills).
// Catalog data changes at most daily, so a per-instance TTL cache keeps the dashboard off the
// warehouse for repeat reads (spec 6.3).
import "server-only";
import { ttlCache } from "@/lib/cache";
import { sql, T } from "@/lib/databricks/sql";
import type { CareerPath, Major, PathSkill, Skill } from "@/lib/types";

// Career paths, skills, majors and path_skills are rebuilt by the seed notebook, not by the app,
// so a 30-minute window costs nothing in freshness and keeps four warehouse queries off most
// requests. A cold serverless instance still pays for them once.
const cache = ttlCache<unknown>(30 * 60_000);
const cached = <T>(key: string, load: () => Promise<T>) => cache.get(key, load) as Promise<T>;

export const careerPaths = () =>
  cached("career_paths", () =>
    sql<CareerPath>(
      `SELECT path_id, path_name, career_family, core_skills, typical_majors,
              median_salary_usd_mock, onet_soc_code, description
         FROM ${T("career_paths")} ORDER BY path_id`,
    ),
  );

export const skills = () =>
  cached("skills", () =>
    sql<Skill>(`SELECT skill_id, skill_name, category FROM ${T("skills")} ORDER BY skill_name`),
  );

export const majors = () =>
  cached("majors", () =>
    sql<Major>(`SELECT major_code, major_name, college FROM ${T("majors")} ORDER BY major_name`),
  );

export const pathSkills = () =>
  cached("path_skills", () =>
    sql<PathSkill>(
      `SELECT path_id, skill_id, skill_name, importance FROM ${T("path_skills")}
        ORDER BY path_id, importance DESC`,
    ),
  );

export async function pathById(pathId: string): Promise<CareerPath | undefined> {
  return (await careerPaths()).find((p) => p.path_id === pathId);
}

export async function pathNameFor(pathId: string | null): Promise<string | null> {
  if (!pathId) return null;
  return (await pathById(pathId))?.path_name ?? null;
}

/**
 * Map a free-text goal ("investment banking", "IB", "invest-banking") to a real path.
 * UC Functions filter on the exact path name, so an unmatched guess silently returns no rows;
 * every model-supplied path goes through here first (spec 1.1: ground everything in data).
 */
export async function resolvePath(input: string): Promise<CareerPath | undefined> {
  const paths = await careerPaths();
  const needle = normalize(input);
  if (!needle) return undefined;

  return (
    paths.find((p) => p.path_id.toLowerCase() === input.trim().toLowerCase()) ??
    paths.find((p) => normalize(p.path_name) === needle) ??
    paths.find(
      (p) => normalize(p.path_name).includes(needle) || needle.includes(normalize(p.path_name)),
    ) ??
    paths.find((p) => initials(p.path_name) === needle) ??
    paths.find((p) => overlaps(normalize(p.path_name), needle))
  );
}

/** Lowercase, strip punctuation, collapse whitespace: "Investment-Banking!" -> "investment banking". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "Investment Banking" -> "ib", so an abbreviation still resolves. */
function initials(name: string): string {
  return normalize(name)
    .split(" ")
    .filter((w) => !["and", "of", "the"].includes(w))
    .map((w) => w[0] ?? "")
    .join("");
}

/** Last resort: share a distinctive word, e.g. "banking" or "consulting". */
function overlaps(pathName: string, needle: string): boolean {
  const stop = new Set(["and", "of", "the", "career", "job", "role", "intern", "internship"]);
  const words = new Set(needle.split(" ").filter((w) => w.length > 3 && !stop.has(w)));
  return pathName.split(" ").some((w) => w.length > 3 && words.has(w));
}

/** Test seam: drop cached catalog data (used by pnpm demo:record and unit tests). */
export function clearCatalogCache() {
  cache.clear();
}

/**
 * Load the whole reference catalog in one parallel batch. /api/health?warm=1 calls this so the
 * first student of the demo does not pay for four cold warehouse queries (spec 14.3).
 */
export async function warmCatalog(): Promise<void> {
  await Promise.all([careerPaths(), skills(), majors(), pathSkills()]);
}
