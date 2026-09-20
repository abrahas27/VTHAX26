// src/lib/databricks/sql.ts : parameterized SQL over the Statement Execution API (spec 11.3).
import "server-only";
import { env } from "@/lib/env";

export type SqlValue = string | number | boolean | null;

/** Statement API parameter type names (a subset; everything else goes over as STRING). */
const typeOf = (v: SqlValue): string =>
  typeof v === "number"
    ? Number.isInteger(v)
      ? "INT"
      : "DOUBLE"
    : typeof v === "boolean"
      ? "BOOLEAN"
      : "STRING";

export class DatabricksError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DatabricksError";
  }
}

/** Authenticated fetch against the workspace REST API. Never call this from client components. */
export async function dbx<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.DATABRICKS_HOST}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${env.DATABRICKS_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new DatabricksError(`Databricks ${res.status}: ${await res.text()}`, res.status);
  }
  return (await res.json()) as T;
}

interface StatementColumn {
  name: string;
  type_name: string;
}

interface StatementResponse {
  statement_id: string;
  status: { state: string; error?: { message?: string } };
  manifest?: { schema: { columns?: StatementColumn[] } };
  result?: { data_array?: (string | null)[][] };
}

/**
 * JSON_ARRAY results arrive as strings; arrays/structs/maps arrive as JSON text.
 * Coerce by the manifest's column type so callers get real numbers, booleans, and arrays.
 */
export function coerce(value: string | null, typeName: string): unknown {
  if (value === null) return null;
  const type = typeName.toUpperCase();
  if (
    ["INT", "INTEGER", "LONG", "BIGINT", "SHORT", "BYTE", "DOUBLE", "FLOAT", "DECIMAL"].includes(
      type,
    )
  ) {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  if (type === "BOOLEAN") return value === "true";
  if (["ARRAY", "STRUCT", "MAP"].includes(type)) {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value; // malformed JSON is better surfaced as text than as a thrown request
    }
  }
  return value; // STRING, DATE, TIMESTAMP stay ISO text
}

export function rowsFrom<T = Record<string, unknown>>(res: StatementResponse): T[] {
  const cols = res.manifest?.schema.columns ?? [];
  return (res.result?.data_array ?? []).map(
    (row) =>
      Object.fromEntries(cols.map((c, i) => [c.name, coerce(row[i] ?? null, c.type_name)])) as T,
  );
}

const TERMINAL = ["SUCCEEDED", "FAILED", "CANCELED", "CANCELLED", "CLOSED"];

/**
 * Run a statement with named parameters (`:name`) and return typed rows.
 * A cold warehouse returns PENDING/RUNNING, so poll until the statement reaches a terminal state.
 */
export async function sql<T = Record<string, unknown>>(
  statement: string,
  params: Record<string, SqlValue> = {},
  opts: { timeoutMs?: number } = {},
): Promise<T[]> {
  const deadline = Date.now() + (opts.timeoutMs ?? 60_000);
  let res = await dbx<StatementResponse>("/api/2.0/sql/statements", {
    method: "POST",
    body: JSON.stringify({
      warehouse_id: env.DATABRICKS_WAREHOUSE_ID,
      statement,
      catalog: env.DATABRICKS_CATALOG,
      schema: env.DATABRICKS_SCHEMA,
      parameters: Object.entries(params).map(([name, value]) => ({
        name,
        value: value === null ? null : String(value),
        type: typeOf(value),
      })),
      wait_timeout: "30s",
      on_wait_timeout: "CONTINUE",
      disposition: "INLINE",
      format: "JSON_ARRAY",
    }),
  });

  while (!TERMINAL.includes(res.status.state)) {
    if (Date.now() > deadline) {
      await dbx(`/api/2.0/sql/statements/${res.statement_id}/cancel`, { method: "POST" }).catch(
        () => undefined,
      );
      throw new DatabricksError(`Statement timed out after ${opts.timeoutMs ?? 60_000}ms`);
    }
    await new Promise((r) => setTimeout(r, 1000));
    res = await dbx<StatementResponse>(`/api/2.0/sql/statements/${res.statement_id}`);
  }

  if (res.status.state !== "SUCCEEDED") {
    throw new DatabricksError(res.status.error?.message ?? res.status.state);
  }
  return rowsFrom<T>(res);
}

/** Fully qualified table/function name from configuration; never interpolate user input here. */
export const T = (name: string) => `${env.DATABRICKS_CATALOG}.${env.DATABRICKS_SCHEMA}.${name}`;

export type WarehouseState =
  "RUNNING" | "STARTING" | "STOPPED" | "STOPPING" | "DELETED" | "UNKNOWN";

export async function warehouseState(): Promise<WarehouseState> {
  const res = await dbx<{ state?: string }>(
    `/api/2.0/sql/warehouses/${env.DATABRICKS_WAREHOUSE_ID}`,
  );
  return (res.state as WarehouseState) ?? "UNKNOWN";
}

/** Fire-and-forget warm-up used by /api/health?warm=1 before a demo (spec 14.3). */
export async function startWarehouse(): Promise<void> {
  await dbx(`/api/2.0/sql/warehouses/${env.DATABRICKS_WAREHOUSE_ID}/start`, { method: "POST" });
}
