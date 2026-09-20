// GET /api/dashboard?tab=for-you|<pathId>&days=30&sections=all|core|roadmap : the For You /
// goal tab payload (F4).
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseQuery, requireUser } from "@/lib/api";
import { buildDashboard } from "@/lib/dashboard";
import { cachedDashboard, cacheKey } from "@/lib/dashboard-cache";
import { getProfile } from "@/lib/db/queries";
import { demoDashboard, isDemoMode } from "@/lib/demo";
import { withTiming } from "@/lib/timing";

export const runtime = "nodejs";
export const maxDuration = 60;
// Lakebase is in AWS us-east-2 and the workspace is in the same region, so run the function in
// the nearest Vercel region rather than wherever the viewer happens to be (spec 6.4).
export const preferredRegion = ["iad1"];

const QuerySchema = z.object({
  tab: z
    .string()
    .regex(/^(for-you|CP\d{2})$/)
    .default("for-you"),
  days: z.coerce.number().int().min(1).max(120).default(30),
  sections: z.enum(["all", "core", "roadmap"]).default("all"),
});

export async function GET(req: Request) {
  const query = parseQuery(req.url, QuerySchema);
  if (!query.ok) return query.response;
  const { tab, days, sections } = query.data;

  if (isDemoMode()) {
    const demo = await demoDashboard(tab);
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
        const payload = await cachedDashboard(cacheKey(auth.user.userId, tab, days, sections), () =>
          buildDashboard({ profile, tab, days, sections }),
        );
        return NextResponse.json(payload);
      } catch (err) {
        console.error("[dashboard] failed", err);
        // Databricks unreachable or over quota: serve the recorded fixture rather than an error,
        // flagged so the UI can say so (spec 14.4).
        const demo = await demoDashboard(tab);
        if (demo) return NextResponse.json({ ...demo, demoMode: true });
        return apiError("upstream_error", "Could not load your dashboard from Databricks.");
      }
    },
    { userId: auth.user.userId, tab, sections },
  );
  result.headers.set("Server-Timing", serverTiming);
  return result;
}
