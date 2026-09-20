// POST /api/admin/genie : "Ask the data" box on Admin Insights (spec F11, 11.10).
// Route protection (ADMIN_EMAILS) is enforced by src/proxy.ts for every /api/admin/* path.
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseBody, requireUser } from "@/lib/api";
import { askGenie, genieConfigured } from "@/lib/databricks/genie";
import { withTiming } from "@/lib/timing";

export const runtime = "nodejs";
export const maxDuration = 60;
// Lakebase and the Databricks workspace both live in AWS us-east-2; iad1 is the closest Vercel
// region, so the round trips this route makes are as short as they can be (spec 6.4).
export const preferredRegion = ["iad1"];

const BodySchema = z.object({
  question: z.string().trim().min(1).max(500),
  conversationId: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!genieConfigured()) {
    return apiError(
      "not_configured",
      "Set DATABRICKS_GENIE_SPACE_ID to use Ask the data (spec 11.10).",
    );
  }

  const body = await parseBody(req, BodySchema);
  if (!body.ok) return body.response;

  const { result, serverTiming } = await withTiming(
    "/api/admin/genie",
    async () => {
      try {
        const answer = await askGenie(body.data.question, body.data.conversationId);
        return NextResponse.json(answer);
      } catch (err) {
        console.error("[admin/genie] failed", err);
        return apiError("upstream_error", "Genie could not answer that right now. Try again.");
      }
    },
    { userId: auth.user.userId },
  );
  result.headers.set("Server-Timing", serverTiming);
  return result;
}
