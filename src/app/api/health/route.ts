// GET /api/health : liveness + Databricks reachability (spec 9, 11.3).
// Public route (see src/proxy.ts). ?warm=1 also starts the warehouse and primes the caches a
// student's first page load would otherwise pay for (spec 14.3).
import { NextResponse } from "next/server";
import { warmCatalog } from "@/lib/catalog";
import { env, isDemoMode } from "@/lib/env";
import { sql, startWarehouse, warehouseState } from "@/lib/databricks/sql";
import { lakebaseConfigured, lakebaseReachable, warmLakebase } from "@/lib/db/lakebase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Lakebase and the Databricks workspace both live in AWS us-east-2; iad1 is the closest Vercel
// region, so the round trips this route makes are as short as they can be (spec 6.4).
export const preferredRegion = ["iad1"];
export const maxDuration = 60;

export async function GET(req: Request) {
  const warm = new URL(req.url).searchParams.get("warm") === "1";

  // The warehouse check and the Lakebase check have nothing to do with each other; running them
  // in series doubled the latency of the one request the landing page fires on every visit.
  const [warehouse, lakebase] = await Promise.all([checkWarehouse(warm), lakebaseReachable()]);

  // A warm-up is a promise the page made to the student, not a report: prime the reference
  // catalog and the Lakebase connection in the background so the first dashboard load is warm.
  // Deliberately not awaited -- the caller only needs to know the warehouse was asked to start.
  if (warm && warehouse === "RUNNING") {
    void Promise.all([
      warmCatalog().catch((err) => console.error("[health] catalog warm-up failed", err)),
      warmLakebase().catch((err) => console.error("[health] lakebase warm-up failed", err)),
    ]);
  }

  const llm = Boolean(env.DATABRICKS_LLM_ENDPOINT);
  const body = {
    ok: warehouse === "RUNNING" || isDemoMode(),
    warehouse,
    lakebase,
    llm,
    demoMode: isDemoMode(),
    configured: { lakebase: lakebaseConfigured(), llm },
  };
  // A STARTING warehouse is not an error the UI should shout about: it is the expected state for
  // the ~30-60 s after a warm-up, and the client shows "Waking up live data..." for it.
  return NextResponse.json(body, { status: body.ok || warehouse === "STARTING" ? 200 : 503 });
}

async function checkWarehouse(warm: boolean) {
  try {
    const state = await warehouseState();
    if (warm && state !== "RUNNING" && state !== "STARTING") {
      void startWarehouse().catch((err) => console.error("[health] warehouse start failed", err));
      return "STARTING";
    }
    // A RUNNING warehouse should also answer a query; anything else is reported as-is.
    if (state === "RUNNING") await sql("SELECT 1", {}, { timeoutMs: 15_000 });
    return state;
  } catch (err) {
    console.error("[health] warehouse check failed", err);
    return "ERROR";
  }
}
