// src/lib/db/lakebase.ts : pooled Postgres access to Lakebase (spec 11.8).
import "server-only";
import { Pool, type QueryResultRow } from "pg";
import { env, requireEnv } from "@/lib/env";
import { sqlLabel, timed } from "@/lib/timing";

/** True once the human has finished spec 11.8; routes can degrade instead of throwing. */
export const lakebaseConfigured = () =>
  Boolean(env.LAKEBASE_HOST && env.LAKEBASE_DB && env.LAKEBASE_USER) &&
  Boolean(env.LAKEBASE_PASSWORD || env.LAKEBASE_ENDPOINT);

interface DatabaseCredential {
  token?: string;
  expire_time?: string;
}

let cachedToken: { token: string; exp: number } | null = null;

/**
 * Lakebase autoscaling projects address compute as
 * `projects/{project_id}/branches/{branch_id}/endpoints/{endpoint_id}`.
 * Tolerate a leading slash or a missing `projects/` prefix so a copied value still works.
 */
export function normalizeEndpoint(value: string): string {
  const trimmed = value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  const path = trimmed.startsWith("projects/") ? trimmed : `projects/${trimmed}`;
  if (!/^projects\/[^/]+\/branches\/[^/]+\/endpoints\/[^/]+$/.test(path)) {
    throw new Error(
      `LAKEBASE_ENDPOINT must look like projects/<project>/branches/<branch>/endpoints/<endpoint>, got "${value}".`,
    );
  }
  return path;
}

/**
 * Option (b): a native Postgres role password, used as-is when LAKEBASE_PASSWORD is set.
 * Option (a): POST /api/2.0/postgres/credentials with the endpoint resource name returns a
 * Postgres password valid for ~60 minutes; refresh it a few minutes before `expire_time`.
 */
async function lakebasePassword(): Promise<string> {
  if (env.LAKEBASE_PASSWORD) return env.LAKEBASE_PASSWORD;
  if (cachedToken && cachedToken.exp - Date.now() > 5 * 60_000) return cachedToken.token;

  const { LAKEBASE_ENDPOINT } = requireEnv(["LAKEBASE_ENDPOINT"], "Lakebase OAuth credentials");
  const res = await timed("lakebase:credential", () =>
    fetch(`${env.DATABRICKS_HOST}/api/2.0/postgres/credentials`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${env.DATABRICKS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint: normalizeEndpoint(LAKEBASE_ENDPOINT) }),
    }),
  );
  if (!res.ok) {
    throw new Error(`Lakebase credential request failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as DatabaseCredential;
  if (!json.token) throw new Error("Lakebase credential response contained no token");
  cachedToken = {
    token: json.token,
    // Fall back to a conservative 50 minutes if the response omits an expiry.
    exp: Date.parse(json.expire_time ?? "") || Date.now() + 50 * 60_000,
  };
  return cachedToken.token;
}

// Serverless functions open many short-lived connections, so keep the pool small and reuse it
// across invocations of the same warm instance.
let cachedPool: Pool | undefined;

export function pool(): Pool {
  if (!cachedPool) {
    const cfg = requireEnv(["LAKEBASE_HOST", "LAKEBASE_DB", "LAKEBASE_USER"], "Lakebase");
    if (!env.LAKEBASE_PASSWORD && !env.LAKEBASE_ENDPOINT) {
      throw new Error(
        "Lakebase needs LAKEBASE_ENDPOINT (OAuth credentials) or LAKEBASE_PASSWORD (native role). See docs/integrations/lakebase.md.",
      );
    }
    cachedPool = new Pool({
      host: cfg.LAKEBASE_HOST,
      port: 5432,
      database: cfg.LAKEBASE_DB,
      user: cfg.LAKEBASE_USER,
      password: lakebasePassword, // node-postgres accepts an async password provider
      ssl: { rejectUnauthorized: true },
      max: 5,
      // Lakebase is in us-east-2 and Vercel functions stay warm between requests, so holding a
      // connection open for a few minutes turns the next request's ~250 ms TLS + auth handshake
      // into nothing. Well under the server's own idle timeout.
      idleTimeoutMillis: 5 * 60_000,
      connectionTimeoutMillis: 8_000,
    });
    // search_path belongs to the connection, not the query. Setting it once when a physical
    // connection opens (pg queues it ahead of anything the caller sends on that client) saves a
    // full round trip on every query but the first -- roughly 40-70 ms each, on every route.
    cachedPool.on("connect", (client) => {
      void client.query("SET search_path TO app, public");
    });
    cachedPool.on("error", (err) => console.error("[lakebase] idle client error", err));
  }
  return cachedPool;
}

/** Run a parameterized query ($1, $2, ...) against schema `app`. */
export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  // pool.query checks a client out and releases it for us; search_path is already set by the
  // pool's `connect` handler above, so this is one round trip rather than two.
  return timed(sqlLabel("pg", text), async () => (await pool().query<T>(text, values)).rows);
}

/**
 * Open a connection now so the first real query does not pay for the TLS handshake, the OAuth
 * credential mint, and `SET search_path`. Called by /api/health?warm=1 before a demo (spec 14.3).
 */
export async function warmLakebase(): Promise<void> {
  if (!lakebaseConfigured()) return;
  await q("SELECT 1");
}

export async function lakebaseReachable(): Promise<boolean> {
  if (!lakebaseConfigured()) return false;
  try {
    await q("SELECT 1");
    return true;
  } catch (err) {
    console.error("[lakebase] health check failed", err);
    return false;
  }
}
