// src/lib/ingest.ts : Vercel Cron fallback for external API ingestion (spec 11.9, 12.4-12.6, 14.4).
// Used only when Databricks serverless compute cannot reach the internet; the normal path is
// databricks/02_ingest_external_apis.py running inside the workspace. Writes go through the same
// SQL Statement API as everything else, so no separate Databricks driver is needed here either.
import "server-only";
import { createHash } from "node:crypto";
import { sql, T } from "@/lib/databricks/sql";
import { requireEnv } from "@/lib/env";

export interface IngestSummary {
  onetRows: number;
  blsRows: number;
  postingRows: number;
  errors: string[];
}

async function ensureTables(): Promise<void> {
  await sql(
    `CREATE TABLE IF NOT EXISTS ${T("onet_occupation_skills")}
       (soc_code STRING, element_name STRING, importance DOUBLE, description STRING,
        _ingested_at TIMESTAMP) USING DELTA`,
  );
  await sql(
    `CREATE TABLE IF NOT EXISTS ${T("bls_wages")}
       (soc_code STRING, year INT, median_annual_wage DOUBLE, _ingested_at TIMESTAMP) USING DELTA`,
  );
  await sql(
    `CREATE TABLE IF NOT EXISTS ${T("bronze_job_postings")}
       (source STRING, company_id STRING, job_id STRING, title STRING, location STRING, url STRING,
        updated_at STRING, raw STRING, _ingested_at TIMESTAMP) USING DELTA`,
  );
}

async function socCodes(): Promise<string[]> {
  const rows = await sql<{ onet_soc_code: string }>(
    `SELECT DISTINCT onet_soc_code FROM ${T("career_paths")} WHERE onet_soc_code IS NOT NULL`,
  );
  return rows.map((r) => r.onet_soc_code);
}

/** O*NET Web Services (spec 12.4). Verify the current auth scheme and paths against live docs. */
interface OnetSkill {
  name?: string;
  description?: string;
  score?: { value?: number };
}
async function ingestOnet(errors: string[]): Promise<number> {
  const { ONET_KEY } = requireEnv(["ONET_KEY"], "O*NET ingestion");
  const codes = await socCodes();
  const auth = Buffer.from(`${ONET_KEY}:`).toString("base64");
  let count = 0;

  for (const soc of codes) {
    try {
      const res = await fetch(
        `https://services.onetcenter.org/ws/online/occupations/${soc}/summary/skills`,
        { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } },
      );
      if (!res.ok) throw new Error(`O*NET ${res.status} for ${soc}`);
      const body = (await res.json()) as { skill?: OnetSkill[] };
      for (const item of body.skill ?? []) {
        if (!item.name) continue;
        await sql(
          `INSERT INTO ${T("onet_occupation_skills")}
             (soc_code, element_name, importance, description, _ingested_at)
           VALUES (:soc, :name, :importance, :description, current_timestamp())`,
          {
            soc,
            name: item.name,
            importance: item.score?.value ?? 0,
            description: item.description ?? null,
          },
        );
        count++;
      }
    } catch (err) {
      errors.push(`onet:${soc}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return count;
}

/** BLS Public Data API (spec 12.6). Confirm the OEWS series id pattern with the BLS series formatter. */
interface BlsSeries {
  seriesID: string;
  data?: { year: string; value: string }[];
}
async function ingestBls(errors: string[]): Promise<number> {
  const { BLS_KEY } = requireEnv(["BLS_KEY"], "BLS ingestion");
  const codes = await socCodes();
  const seriesFor = new Map(
    codes.map((soc) => [`OEUN000000000000${soc.split(".")[0]?.replace(/-/g, "")}03`, soc]),
  );
  const ids = [...seriesFor.keys()];
  const year = new Date().getFullYear();
  let count = 0;

  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);
    try {
      const res = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seriesid: batch,
          startyear: String(year - 2),
          endyear: String(year),
          registrationkey: BLS_KEY,
        }),
      });
      if (!res.ok) throw new Error(`BLS ${res.status}`);
      const body = (await res.json()) as { Results?: { series?: BlsSeries[] } };
      for (const series of body.Results?.series ?? []) {
        const soc = seriesFor.get(series.seriesID);
        const points = series.data ?? [];
        if (!soc || points.length === 0) continue;
        const latest = points.reduce((a, b) => (Number(a.year) > Number(b.year) ? a : b));
        const wage = Number(latest.value);
        if (!Number.isFinite(wage)) continue;
        await sql(
          `INSERT INTO ${T("bls_wages")} (soc_code, year, median_annual_wage, _ingested_at)
           VALUES (:soc, :year, :wage, current_timestamp())`,
          { soc, year: Number(latest.year), wage },
        );
        count++;
      }
    } catch (err) {
      errors.push(`bls:batch${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return count;
}

/**
 * Greenhouse + Lever public job boards (spec 12.5). Empty by default: only add a company here once
 * you have personally verified its careers page links to `boards.greenhouse.io/<token>` or
 * `jobs.lever.co/<token>`. Writes bronze_job_postings, then maps student-relevant postings into
 * `opportunities` (spec 12.5) -- the same two-step pipeline as the Databricks-side
 * `02_ingest_external_apis.py`, so this fallback has real parity with the primary path instead of
 * only ever reaching the raw bronze table.
 */
// Same tokens as databricks/02_ingest_external_apis.py -- verified live 2026-09-20 against
// boards-api.greenhouse.io, each returning a real, non-empty jobs list for a company that already
// exists in our companies table. Keep the two BOARDS lists in sync; never add an unverified token.
const BOARDS: Record<string, { source: "greenhouse" | "lever"; token: string }> = {
  CO002: { source: "greenhouse", token: "databricks" }, // Databricks
  CO019: { source: "greenhouse", token: "janestreet" }, // Jane Street
  CO009: { source: "greenhouse", token: "bcg" }, // Boston Consulting Group
};

const INTERN_KEYWORDS = [
  "intern",
  "summer analyst",
  "new grad",
  "co-op",
  "university",
  "rotational",
];
const INTERN_PATTERN = new RegExp(INTERN_KEYWORDS.join("|"), "i");

// Same order as the Databricks-side `PATH_RULES`: most specific first, so e.g. "Mechanical
// Engineer" matches CP15 rather than falling into CP01's generic "engineer" catch-all. Covers all
// 19 career_paths rows -- keep both lists in sync.
const PATH_RULES: [string, string[]][] = [
  ["CP15", ["mechanical engineer", "aerospace engineer", "mechanical", "aerospace"]],
  ["CP16", ["electrical engineer", "embedded", "electrical", "firmware"]],
  ["CP17", ["civil engineer", "structural engineer", "civil", "infrastructure"]],
  ["CP18", ["biomedical", "bioengineer", "research scientist", "lab research"]],
  ["CP10", ["security engineer", "cybersecurity", "penetration tester", "security analyst"]],
  ["CP03", ["machine learning engineer", "ml engineer", "ai engineer", "deep learning"]],
  ["CP02", ["data scien", "data analyst", "analytics"]],
  ["CP06", ["quant"]],
  ["CP04", ["investment banking", "banking analyst"]],
  ["CP05", ["sales and trading", "trading analyst", "markets analyst"]],
  ["CP09", ["audit", "assurance"]],
  ["CP07", ["management consult", "strategy consult"]],
  ["CP08", ["technology consult", "it consult", "tech consult"]],
  ["CP11", ["product manager", "product management"]],
  ["CP12", ["ux designer", "product designer", "user experience"]],
  ["CP13", ["supply chain", "operations analyst", "logistics"]],
  ["CP14", ["marketing", "brand manager"]],
  ["CP19", ["policy analyst", "public policy", "government affairs"]],
  ["CP01", ["software", "swe", "developer", "full stack", "backend", "frontend", "engineer"]],
];

/** Cheap keyword rule, same as the Databricks-side `guess_path_id`; both only ever pick a real path_id. */
function guessPathId(title: string): string | null {
  const t = title.toLowerCase();
  for (const [pathId, needles] of PATH_RULES) {
    if (needles.some((n) => t.includes(n))) return pathId;
  }
  return null;
}

/**
 * Deterministic across runs -- a raw hash of process-random input would mint a new id for the same
 * posting on every scheduled re-run and duplicate it under a naive append. Same algorithm as the
 * Databricks-side `stable_opportunity_id` so the two ingestion paths never disagree on an id for
 * the same posting.
 */
function stableOpportunityId(source: string, jobId: string): string {
  const digest = createHash("md5").update(`${source}:${jobId}`).digest("hex");
  return `OPX${(parseInt(digest.slice(0, 8), 16) % 100000).toString().padStart(5, "0")}`;
}

interface GreenhouseJob {
  id: number | string;
  title: string;
  location?: { name?: string };
  absolute_url?: string;
  updated_at?: string;
}
interface LeverJob {
  id: string;
  text: string;
  categories?: { location?: string };
  hostedUrl?: string;
  createdAt?: number;
}
interface CollectedPosting {
  source: string;
  companyId: string;
  jobId: string;
  title: string;
  location: string | null;
  url: string | null;
}
async function ingestJobBoards(errors: string[]): Promise<number> {
  let count = 0;
  const postings: CollectedPosting[] = [];
  for (const [companyId, { source, token }] of Object.entries(BOARDS)) {
    try {
      if (source === "greenhouse") {
        const res = await fetch(
          `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`,
        );
        if (!res.ok) throw new Error(`Greenhouse ${res.status}`);
        const body = (await res.json()) as { jobs?: GreenhouseJob[] };
        for (const j of body.jobs ?? []) {
          const location = j.location?.name ?? null;
          const url = j.absolute_url ?? null;
          await insertPosting({
            source,
            companyId,
            jobId: String(j.id),
            title: j.title,
            location,
            url,
            updatedAt: j.updated_at ?? null,
            raw: j,
          });
          postings.push({ source, companyId, jobId: String(j.id), title: j.title, location, url });
          count++;
        }
      } else {
        const res = await fetch(`https://api.lever.co/v0/postings/${token}?mode=json`);
        if (!res.ok) throw new Error(`Lever ${res.status}`);
        const jobs = (await res.json()) as LeverJob[];
        for (const j of jobs) {
          const location = j.categories?.location ?? null;
          const url = j.hostedUrl ?? null;
          await insertPosting({
            source,
            companyId,
            jobId: j.id,
            title: j.text,
            location,
            url,
            updatedAt: j.createdAt ? String(j.createdAt) : null,
            raw: j,
          });
          postings.push({ source, companyId, jobId: j.id, title: j.text, location, url });
          count++;
        }
      }
    } catch (err) {
      errors.push(`${source}:${companyId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (postings.length > 0) await mapPostingsToOpportunities(postings, errors);
  return count;
}

/** Spec 12.5 step 2: student-relevant postings only, deduped and inserted into `opportunities`. */
async function mapPostingsToOpportunities(
  postings: CollectedPosting[],
  errors: string[],
): Promise<number> {
  const studentPostings = postings.filter((p) => INTERN_PATTERN.test(p.title));
  if (studentPostings.length === 0) return 0;

  const existingRows = await sql<{ opportunity_id: string }>(
    `SELECT opportunity_id FROM ${T("opportunities")}`,
  );
  const existingIds = new Set(existingRows.map((r) => r.opportunity_id));

  const companyIds = [...new Set(studentPostings.map((p) => p.companyId))];
  const companyRows = await sql<{ company_id: string; company_name: string }>(
    `SELECT company_id, company_name FROM ${T("companies")}
       WHERE company_id IN (${companyIds.map((_, i) => `:c${i}`).join(", ")})`,
    Object.fromEntries(companyIds.map((id, i) => [`c${i}`, id])),
  );
  const companyNames = new Map(companyRows.map((r) => [r.company_id, r.company_name]));

  let count = 0;
  for (const p of studentPostings) {
    const pathId = guessPathId(p.title);
    if (pathId === null) continue; // would be dropped anyway by gold_opportunity_search_docs's inner join
    const opportunityId = stableOpportunityId(p.source, p.jobId);
    if (existingIds.has(opportunityId)) continue;
    try {
      await sql(
        `INSERT INTO ${T("opportunities")}
           (opportunity_id, company_id, company_name, title, opportunity_type, path_id,
            required_skills, preferred_skills, eligible_majors, class_years, location,
            min_gpa, posted_date, deadline, apply_url, source)
         VALUES (:opportunityId, :companyId, :companyName, :title, :opportunityType, :pathId,
                 array(), array(), array('ALL'), array('Sophomore', 'Junior', 'Senior'), :location,
                 NULL, NULL, NULL, :applyUrl, :source)`,
        {
          opportunityId,
          companyId: p.companyId,
          companyName: companyNames.get(p.companyId) ?? null,
          title: p.title,
          opportunityType: /intern/i.test(p.title) ? "internship" : "full_time",
          pathId,
          location: p.location,
          applyUrl: p.url,
          source: p.source,
        },
      );
      existingIds.add(opportunityId);
      count++;
    } catch (err) {
      errors.push(
        `opportunities:${p.source}:${p.jobId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return count;
}

async function insertPosting(p: {
  source: string;
  companyId: string;
  jobId: string;
  title: string;
  location: string | null;
  url: string | null;
  updatedAt: string | null;
  raw: unknown;
}) {
  await sql(
    `INSERT INTO ${T("bronze_job_postings")}
       (source, company_id, job_id, title, location, url, updated_at, raw, _ingested_at)
     VALUES (:source, :companyId, :jobId, :title, :location, :url, :updatedAt, :raw, current_timestamp())`,
    {
      source: p.source,
      companyId: p.companyId,
      jobId: p.jobId,
      title: p.title,
      location: p.location,
      url: p.url,
      updatedAt: p.updatedAt,
      raw: JSON.stringify(p.raw),
    },
  );
}

/** Runs whichever sections have keys configured; a missing key just skips that section. */
export async function runIngestion(): Promise<IngestSummary> {
  await ensureTables();
  const errors: string[] = [];

  const [onetRows, blsRows, postingRows] = await Promise.all([
    tryOr(() => ingestOnet(errors), errors, "onet"),
    tryOr(() => ingestBls(errors), errors, "bls"),
    tryOr(() => ingestJobBoards(errors), errors, "job_boards"),
  ]);

  return { onetRows, blsRows, postingRows, errors };
}

async function tryOr(fn: () => Promise<number>, errors: string[], label: string): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}
