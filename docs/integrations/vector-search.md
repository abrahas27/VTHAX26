# Databricks Vector Search integration

## Purpose in HokiePath

Semantic matching so "learn company valuation" finds a DCF workshop even though the words don't
overlap (F10). Also backs the `semantic_search` agent tool (spec 10.3), so the chat can answer
"something to learn valuation"-style questions. Used by F2 (optional skill-normalization fallback,
not yet wired in) and F10.

## Cost / free tier limits

Free Edition limits how many Vector Search endpoints a workspace can have; the setup notebook
reuses one endpoint (`hokiepath-vs`) for both indexes. Endpoint creation can take several minutes.
Indexing runs on the `TRIGGERED` pipeline type, so a new row is not searchable until the index is
manually synced (or the endpoint auto-syncs on the schedule Databricks assigns).

## Human steps (do these in order)

1. Run `databricks/01_setup_hokiepath_lakehouse.py` with the widget `setup_vector_search` set to
   `true` (last section of the notebook). This creates the `hokiepath-vs` endpoint and two Delta
   Sync indexes: `{catalog}.{schema}.gold_event_search_docs_idx` and
   `..._opportunity_search_docs_idx`, embedding with `databricks-gte-large-en`.
2. **Compute → Vector Search** → wait until both indexes show **Online**.
3. Copy the two fully qualified index names into `DATABRICKS_VS_EVENTS_INDEX` and
   `DATABRICKS_VS_OPPS_INDEX`.
4. Nothing else to configure — `src/lib/search.ts` checks `vectorSearchConfigured()` per kind and
   falls back to SQL automatically when an index name is blank.

## Environment variables

| Name                         | Example                                                | Where used          | Secret? |
| ---------------------------- | ------------------------------------------------------ | ------------------- | ------- |
| `DATABRICKS_VS_EVENTS_INDEX` | `workspace.hokiepath.gold_event_search_docs_idx`       | `src/lib/search.ts` | no      |
| `DATABRICKS_VS_OPPS_INDEX`   | `workspace.hokiepath.gold_opportunity_search_docs_idx` | `src/lib/search.ts` | no      |

## Code touchpoints

- `src/lib/databricks/vector.ts` — `vsQuery(index, query, columns, k)` posts to
  `/api/2.0/vector-search/indexes/{index}/query` and reshapes the manifest/columns response into
  rows; `vectorSearchConfigured(kind)` gates whether to try it at all.
- `src/lib/search.ts` — `search(query, opts)` tries Vector Search per kind, logs and falls back to
  a SQL `ILIKE` over `gold_event_search_docs.search_text` / `gold_opportunity_search_docs.search_text`
  on any error (spec 11.7, 14.4). Clubs have no gold search doc, so they are ILIKE-only.
- `src/app/api/search/route.ts` — `GET /api/search?q=...&types=events,opportunities,clubs`.
- `src/lib/agent/tools.ts` — `semantic_search` tool calls the same `search()` function.

## Verify

```bash
curl -s "localhost:3000/api/search?q=learn%20company%20valuation" \
  -H "Cookie: <session cookie>" | jq '.events[0].title, .usedVectorSearch'
```

In the setup notebook: `idx.similarity_search(query_text="learn company valuation and financial
modeling", ...)` should return a finance workshop event.

## Failure modes and fallback

- Index not `Online` yet, or `DATABRICKS_VS_*_INDEX` blank → `search()` uses `ILIKE` automatically;
  the response still has `events`/`opportunities`/`clubs`, just less semantic. `usedVectorSearch`
  in the response tells you which path ran.
- A query error (endpoint stopped, quota) is caught and logged (`[search] vector search failed...`),
  then the same ILIKE fallback runs — search never breaks the demo (spec 14.4).
- **Reranker is blocked on this Free Edition workspace.** `HYBRID` `query_type` works, but its
  reranker step 403s here. `vsQuery` pins `query_type: "ANN"` (pure vector similarity) and never
  passes a reranker option, so this never surfaces — confirmed live 2026-09-20. If a future change
  needs `HYBRID` search, verify the reranker is actually available in the target workspace first.

## Security notes

`vector.ts` starts with `import "server-only"` and reuses the same bearer token as SQL calls; no
separate credential is needed. The index name is passed as a path segment and URL-encoded, never
interpolated into SQL.
