// src/lib/ingest.ts : Vercel Cron fallback for external API ingestion (spec 11.9, 12.4-12.6, 14.4).
// Used only when Databricks serverless compute cannot reach the internet; the normal path is
// databricks/02_ingest_external_apis.py running inside the workspace. Writes go through the same
// SQL Statement API as everything else, so no separate Databricks driver is needed here either.
import "server-only";
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
 * `jobs.lever.co/<token>`. This writes bronze_job_postings only; mapping into `opportunities` happens
 * in the gold refresh (rerun 01_setup_hokiepath_lakehouse.py), same as the Databricks-side path.
 */
const BOARDS: Record<string, { source: "greenhouse" | "lever"; token: string }> = {
  // CO001: { source: "greenhouse", token: "examplecompany" },
};

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
async function ingestJobBoards(errors: string[]): Promise<number> {
  let count = 0;
  for (const [companyId, { source, token }] of Object.entries(BOARDS)) {
    try {
      if (source === "greenhouse") {
        const res = await fetch(
          `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`,
        );
        if (!res.ok) throw new Error(`Greenhouse ${res.status}`);
        const body = (await res.json()) as { jobs?: GreenhouseJob[] };
        for (const j of body.jobs ?? []) {
          await insertPosting({
            source,
            companyId,
            jobId: String(j.id),
            title: j.title,
            location: j.location?.name ?? null,
            url: j.absolute_url ?? null,
            updatedAt: j.updated_at ?? null,
            raw: j,
          });
          count++;
        }
      } else {
        const res = await fetch(`https://api.lever.co/v0/postings/${token}?mode=json`);
        if (!res.ok) throw new Error(`Lever ${res.status}`);
        const jobs = (await res.json()) as LeverJob[];
        for (const j of jobs) {
          await insertPosting({
            source,
            companyId,
            jobId: j.id,
            title: j.text,
            location: j.categories?.location ?? null,
            url: j.hostedUrl ?? null,
            updatedAt: j.createdAt ? String(j.createdAt) : null,
            raw: j,
          });
          count++;
        }
      }
    } catch (err) {
      errors.push(`${source}:${companyId}: ${err instanceof Error ? err.message : String(err)}`);
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
