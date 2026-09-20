// src/lib/databricks/vector.ts : Vector Search REST client (spec 11.7).
// Semantic search over the two Delta Sync indexes built by 01_setup_hokiepath_lakehouse.py
// (gold_event_search_docs_idx, gold_opportunity_search_docs_idx). Falls back to SQL ILIKE when an
// index is not configured or the endpoint errors, so search never breaks the demo (spec 14.4).
import "server-only";
import { dbx } from "./sql";
import { env } from "@/lib/env";

interface VectorSearchResponse {
  manifest?: { columns?: { name: string }[] };
  result?: { data_array?: unknown[][] };
}

export const vectorSearchConfigured = (kind: "events" | "opportunities") =>
  Boolean(env.DATABRICKS_HOST && env.DATABRICKS_TOKEN) &&
  Boolean(kind === "events" ? env.DATABRICKS_VS_EVENTS_INDEX : env.DATABRICKS_VS_OPPS_INDEX);

/**
 * Query a Delta Sync index by semantic similarity. Returns rows shaped like the requested
 * columns plus a trailing `score` column, which the caller strips before returning to the client.
 *
 * `query_type` is pinned to "ANN" (pure vector similarity). This workspace's Free Edition blocks
 * the reranker step, which ships with "HYBRID" query_type -- pinning ANN here means we never rely
 * on the endpoint's default staying non-hybrid, and never pass a reranker option at all.
 */
export async function vsQuery<T = Record<string, unknown>>(
  index: string,
  query: string,
  columns: string[],
  k = 8,
): Promise<T[]> {
  const res = await dbx<VectorSearchResponse>(
    `/api/2.0/vector-search/indexes/${encodeURIComponent(index)}/query`,
    {
      method: "POST",
      body: JSON.stringify({ query_text: query, columns, num_results: k, query_type: "ANN" }),
    },
  );
  const names = (res.manifest?.columns ?? []).map((c) => c.name);
  return (res.result?.data_array ?? []).map(
    (row) => Object.fromEntries(names.map((name, i) => [name, row[i]])) as T,
  );
}
