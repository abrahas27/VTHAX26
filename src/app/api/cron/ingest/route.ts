// GET /api/cron/ingest : Vercel Cron fallback ingestion (spec 11.9, 14.4).
// Only needed if Databricks serverless compute cannot reach the internet and
// databricks/02_ingest_external_apis.py cannot run there; see docs/integrations/vercel-cron.md.
// Not listed in src/proxy.ts's PUBLIC_PAGES/isPublicApi — it is protected by CRON_SECRET instead,
// checked here, since Vercel Cron requests carry no user session.
import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";
import { runIngestion } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { CRON_SECRET } = requireEnv(["CRON_SECRET"], "Vercel Cron ingestion (spec 11.9)");
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Bad cron secret." } },
      { status: 401 },
    );
  }

  const summary = await runIngestion();
  console.log("[cron/ingest] summary", summary);
  return NextResponse.json(summary);
}
