// GET /api/dashboard?tab=for-you|<pathId>&days=30 : the For You / goal tab payload (F4).
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseQuery, requireUser } from "@/lib/api";
import { buildDashboard } from "@/lib/dashboard";
import { getProfile } from "@/lib/db/queries";
import { demoDashboard, isDemoMode } from "@/lib/demo";
import { withTiming } from "@/lib/timing";

export const runtime = "nodejs";
export const maxDuration = 60;

const QuerySchema = z.object({
  tab: z
    .string()
    .regex(/^(for-you|CP\d{2})$/)
    .default("for-you"),
  days: z.coerce.number().int().min(1).max(120).default(30),
});

export async function GET(req: Request) {
  const query = parseQuery(req.url, QuerySchema);
  if (!query.ok) return query.response;

  if (isDemoMode()) {
    const demo = await demoDashboard(query.data.tab);
    if (demo) return NextResponse.json(demo);
  }

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { result, serverTiming } = await withTiming(
    "/api/dashboard",
    async () => {
      const profile = await getProfile(auth.user.userId);
      if (!profile) return apiError("profile_required", "Finish onboarding to see your dashboard.");

      try {
        const payload = await buildDashboard({ profile, ...query.data });
        return NextResponse.json(payload);
      } catch (err) {
        console.error("[dashboard] failed", err);
        const demo = await demoDashboard(query.data.tab);
        if (demo) return NextResponse.json({ ...demo, demoMode: true });
        return apiError("upstream_error", "Could not load your dashboard from Databricks.");
      }
    },
    { userId: auth.user.userId, tab: query.data.tab },
  );
  result.headers.set("Server-Timing", serverTiming);
  return result;
}
