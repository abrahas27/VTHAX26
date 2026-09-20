// src/lib/search.ts : semantic search over events and opportunities (spec F10, 11.7), with a SQL
// ILIKE fallback so search keeps working when Vector Search is not configured or errors (14.4).
// Shared by GET /api/search and the agent's semantic_search tool, so the two cannot drift.
import "server-only";
import { sql, T } from "@/lib/databricks/sql";
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
];

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
      return { rows, vector: true };
    } catch (err) {
      console.error("[search] vector search failed for events; falling back to ILIKE", err);
    }
  }
  const rows = await sql<EventRow>(
    `SELECT ${EVENT_COLUMNS.join(", ")} FROM ${T("gold_event_search_docs")}
      WHERE start_ts >= current_timestamp() AND lower(search_text) LIKE lower(concat('%', :q, '%'))
      ORDER BY start_ts LIMIT ${k}`,
    { q: query },
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
  const rows = await sql<OpportunityRow>(
    `SELECT ${OPPORTUNITY_COLUMNS.join(", ")} FROM ${T("gold_opportunity_search_docs")}
      WHERE (deadline IS NULL OR deadline >= current_date())
        AND lower(search_text) LIKE lower(concat('%', :q, '%'))
      ORDER BY deadline IS NULL, deadline LIMIT ${k}`,
    { q: query },
  );
  return { rows, vector: false };
}

/** Clubs have no gold search doc or Vector Search index; ILIKE is the only path (spec 11.7). */
async function searchClubs(query: string, k: number): Promise<ClubRow[]> {
  return sql<ClubRow>(
    `SELECT club_id, club_name, category, meeting_day, meeting_time, skills_developed,
            description, gobblerconnect_url, application_required
       FROM ${T("clubs")}
      WHERE lower(club_name) LIKE lower(concat('%', :q, '%'))
         OR lower(coalesce(description, '')) LIKE lower(concat('%', :q, '%'))
         OR lower(array_join(skills_developed, ' ')) LIKE lower(concat('%', :q, '%'))
      LIMIT ${k}`,
    { q: query },
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
