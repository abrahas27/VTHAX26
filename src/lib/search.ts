// src/lib/search.ts : semantic search over events and opportunities (spec F10, 11.7), with a SQL
// ILIKE fallback so search keeps working when Vector Search is not configured or errors (14.4).
// Shared by GET /api/search and the agent's semantic_search tool, so the two cannot drift.
import "server-only";
import { sql, T, type SqlValue } from "@/lib/databricks/sql";
import { vectorSearchConfigured, vsQuery } from "@/lib/databricks/vector";
import { env } from "@/lib/env";
import {
  toClub,
  toEvent,
  toOpportunity,
  type ClubRow,
  type EventRow,
  type OpportunityRow,
} from "@/lib/dashboard";
import type { ClubItem, EventItem, OpportunityItem } from "@/lib/types";

const EVENT_COLUMNS = [
  "event_id",
  "title",
  "event_type",
  "start_ts",
  "location",
  "host_name",
  "company_name",
  "path_names",
  "related_skills",
];
const OPPORTUNITY_COLUMNS = [
  "opportunity_id",
  "title",
  "opportunity_type",
  "company_name",
  "path_name",
  "required_skills",
  "class_years",
  "location",
  "deadline",
  "deadline_estimated",
  "apply_url",
];

// Common words that add noise to a match-count ranking without narrowing the result at all.
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "to", "in", "on", "for", "of", "with", "at", "by", "from",
  "about", "into", "over", "after", "before", "between", "is", "are", "be", "this", "that",
  "me", "my", "i", "want", "need", "looking", "something", "find", "show",
]);

/** Splits a query into ranking terms, dropping stopwords -- but never down to zero terms. */
function searchTerms(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return words.length > 0 ? words : [query.toLowerCase()];
}

/** A `(match_count)` SQL expression plus the bound params for it -- one ILIKE per term, summed, so
 * a result matching more of the query's words ranks above one matching only a single word. */
function matchCountExpr(terms: string[], params: Record<string, SqlValue>): string {
  return terms
    .map((term, i) => {
      const key = `term${i}`;
      params[key] = term;
      return `(CASE WHEN lower(search_text) LIKE concat('%', :${key}, '%') THEN 1 ELSE 0 END)`;
    })
    .join(" + ");
}

/** Vector Search has no per-query date filter here, so a past event can rank on relevance alone. */
function upcoming(rows: EventRow[]): EventRow[] {
  const now = Date.now();
  return rows.filter((r) => new Date(r.start_ts).getTime() >= now);
}

export interface SearchResult {
  events: EventItem[];
  opportunities: OpportunityItem[];
  clubs: ClubItem[];
  usedVectorSearch: boolean;
}

async function searchEvents(
  query: string,
  k: number,
): Promise<{ rows: EventRow[]; vector: boolean }> {
  if (vectorSearchConfigured("events")) {
    try {
      const rows = await vsQuery<EventRow>(
        env.DATABRICKS_VS_EVENTS_INDEX ?? "",
        query,
        EVENT_COLUMNS,
        k,
      );
      return { rows: upcoming(rows), vector: true };
    } catch (err) {
      console.error("[search] vector search failed for events; falling back to ILIKE", err);
    }
  }
  const params: Record<string, SqlValue> = {};
  const matchExpr = matchCountExpr(searchTerms(query), params);
  const rows = await sql<EventRow>(
    `SELECT ${EVENT_COLUMNS.join(", ")} FROM ${T("gold_event_search_docs")}
      WHERE start_ts >= current_timestamp() AND (${matchExpr}) > 0
      ORDER BY (${matchExpr}) DESC, start_ts LIMIT ${k}`,
    params,
  );
  return { rows, vector: false };
}

async function searchOpportunities(
  query: string,
  k: number,
): Promise<{ rows: OpportunityRow[]; vector: boolean }> {
  if (vectorSearchConfigured("opportunities")) {
    try {
      const rows = await vsQuery<OpportunityRow>(
        env.DATABRICKS_VS_OPPS_INDEX ?? "",
        query,
        OPPORTUNITY_COLUMNS,
        k,
      );
      return { rows, vector: true };
    } catch (err) {
      console.error("[search] vector search failed for opportunities; falling back to ILIKE", err);
    }
  }
  const params: Record<string, SqlValue> = {};
  const matchExpr = matchCountExpr(searchTerms(query), params);
  const rows = await sql<OpportunityRow>(
    `SELECT ${OPPORTUNITY_COLUMNS.join(", ")} FROM ${T("gold_opportunity_search_docs")}
      WHERE (deadline IS NULL OR deadline >= current_date()) AND (${matchExpr}) > 0
      ORDER BY (${matchExpr}) DESC, deadline IS NULL, deadline LIMIT ${k}`,
    params,
  );
  return { rows, vector: false };
}

/** Clubs have no gold search doc or Vector Search index; ILIKE is the only path (spec 11.7). */
async function searchClubs(query: string, k: number): Promise<ClubRow[]> {
  const params: Record<string, SqlValue> = {};
  const matchExpr = matchCountExpr(searchTerms(query), params).replace(
    /search_text/g,
    "concat_ws(' ', club_name, coalesce(description, ''), array_join(skills_developed, ' '))",
  );
  return sql<ClubRow>(
    `SELECT club_id, club_name, category, meeting_day, meeting_time, skills_developed,
            description, gobblerconnect_url, application_required
       FROM ${T("clubs")}
      WHERE (${matchExpr}) > 0
      ORDER BY (${matchExpr}) DESC
      LIMIT ${k}`,
    params,
  );
}

export interface SearchOptions {
  events?: boolean;
  opportunities?: boolean;
  clubs?: boolean;
  k?: number;
}

export async function search(query: string, opts: SearchOptions = {}): Promise<SearchResult> {
  const k = opts.k ?? 8;
  const [eventsRes, oppsRes, clubRows] = await Promise.all([
    opts.events !== false ? searchEvents(query, k) : Promise.resolve({ rows: [], vector: false }),
    opts.opportunities !== false
      ? searchOpportunities(query, k)
      : Promise.resolve({ rows: [], vector: false }),
    opts.clubs !== false ? searchClubs(query, k) : Promise.resolve([] as ClubRow[]),
  ]);

  return {
    events: eventsRes.rows.map(toEvent),
    opportunities: oppsRes.rows.map(toOpportunity),
    clubs: clubRows.map(toClub),
    usedVectorSearch: eventsRes.vector || oppsRes.vector,
  };
}
