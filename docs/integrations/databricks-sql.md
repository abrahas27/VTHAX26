# Databricks SQL Warehouse (Statement Execution API) integration

## Purpose in HokiePath

Every catalog read and every agent tool call runs as parameterized SQL on a serverless SQL Warehouse over
HTTPS (spec 11.3). No JDBC/ODBC driver is needed, which is what makes it work inside Vercel serverless
functions. Used by F3 (path/skill catalogs), F4 (dashboard), F5-F8 (UC Functions as agent tools), F10
(ILIKE search fallback), F11 (admin KPIs), F12.

## Cost / free tier limits

Free Edition is serverless-only with daily compute quotas. The warehouse auto-stops (10 min idle) and a cold
start takes tens of seconds, so the first query of a session is slow. Inline results are size-limited: keep
queries to a few hundred rows and always use LIMIT.

## Human steps (do these in order)

1. Databricks → **SQL Warehouses** → open the serverless starter warehouse (or create one: smallest size,
   auto-stop 10 min).
2. **Connection details** → copy the last path segment of the HTTP path → `DATABRICKS_WAREHOUSE_ID`.
3. Copy the workspace URL from the browser, without a trailing slash → `DATABRICKS_HOST`.
4. Keep `DATABRICKS_CATALOG=workspace` and `DATABRICKS_SCHEMA=hokiepath` unless the seed notebook was run
   with different widget values.
5. Before a demo, open the warehouse and click **Start**, or hit `/api/health?warm=1` about two minutes ahead.

## Environment variables

| Name                      | Example                                          | Where used                       | Secret? |
| ------------------------- | ------------------------------------------------ | -------------------------------- | ------- |
| `DATABRICKS_HOST`         | `https://dbc-2dd08e5b-fa27.cloud.databricks.com` | `sql.ts`, all Databricks clients | no      |
| `DATABRICKS_TOKEN`        | see databricks-token.md                          | `sql.ts` Authorization header    | yes     |
| `DATABRICKS_WAREHOUSE_ID` | `a1434315e3aeb175`                               | `sql.ts`                         | no      |
| `DATABRICKS_CATALOG`      | `workspace`                                      | `sql.ts`, `functions.ts`         | no      |
| `DATABRICKS_SCHEMA`       | `hokiepath`                                      | `sql.ts`, `functions.ts`         | no      |

## Code touchpoints

- `src/lib/databricks/sql.ts` — `sql()` (named `:params`, polls a cold warehouse until the statement reaches
  a terminal state), `coerce()`/`rowsFrom()` (JSON_ARRAY returns strings; arrays/structs arrive as JSON text),
  `T()` (fully qualified name from config), `warehouseState()`, `startWarehouse()`, `dbx()` (shared REST fetch).
- `src/lib/databricks/functions.ts` — `ucFn(name, args)` knows the positional argument order of the six UC
  Functions. `''` means "any" for string filters; `days_ahead` defaults to 30.
- `src/app/api/health/route.ts` — reports warehouse state and runs `SELECT 1`.
- Tests: `tests/unit/sql-coerce.test.ts`, `tests/unit/uc-functions.test.ts`.

## Verify

```bash
curl -s -X POST "$DATABRICKS_HOST/api/2.0/sql/statements" \
  -H "Authorization: Bearer $DATABRICKS_TOKEN" -H "Content-Type: application/json" \
  -d '{"warehouse_id":"<id>","statement":"SELECT count(*) FROM workspace.hokiepath.events","wait_timeout":"30s"}'
# => SUCCEEDED and 280

curl -s localhost:3000/api/health
# => {"ok":true,"warehouse":"RUNNING",...}
```

Verified 2026-09-19: 280 events, and all six `workspace.hokiepath.*` functions present.

## Failure modes and fallback

- `warehouse: "STOPPED"/"STARTING"` — cold warehouse. `sql()` polls; pre-warm before demos.
- `warehouse: "ERROR"` — bad host/token/warehouse id, or quota exhausted. Check the server log for the
  `Databricks <status>` message.
- 403/401 — token expired (30-day lifetime) or lacks access to the catalog.
- Over quota or unreachable: set `DEMO_MODE=true` to serve `fixtures/demo/*.json` (spec 14.4).

## Security notes

`sql.ts` starts with `import "server-only"`; the token only ever appears in a server-side Authorization
header. SQL uses named parameters only; catalog/schema/function identifiers come from env or the fixed
`FN_ARGS` allow-list, never from user input.
