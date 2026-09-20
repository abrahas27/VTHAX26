// GET /api/health : liveness + Databricks reachability (spec 9, 11.3).
// Public route (see src/proxy.ts). ?warm=1 also starts the warehouse before a demo (14.3).
import { NextResponse } from "next/server";
import { env, isDemoMode } from "@/lib/env";
import { sql, startWarehouse, warehouseState } from "@/lib/databricks/sql";
import { lakebaseConfigured, lakebaseReachable } from "@/lib/db/lakebase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const warm = new URL(req.url).searchParams.get("warm") === "1";

  const warehouse = await (async () => {
    try {
      const state = await warehouseState();
      if (warm && state !== "RUNNING" && state !== "STARTING") {
        void startWarehouse().catch((err) => console.error("[health] warehouse start failed", err));
      }
      // A RUNNING warehouse should also answer a query; anything else is reported as-is.
      if (state === "RUNNING") await sql("SELECT 1", {}, { timeoutMs: 15_000 });
      return state;
    } catch (err) {
      console.error("[health] warehouse check failed", err);
      return "ERROR";
    }
  })();

  const lakebase = await lakebaseReachable();
  // The chat/resume features need a serving endpoint; it is configured in spec 11.5 (P2).
  const llm = Boolean(env.DATABRICKS_LLM_ENDPOINT);

  const body = {
    ok: warehouse === "RUNNING" || isDemoMode(),
    warehouse,
    lakebase,
    llm,
    demoMode: isDemoMode(),
    configured: { lakebase: lakebaseConfigured(), llm },
  };
  return NextResponse.json(body, { status: body.ok ? 200 : 503 });
}
