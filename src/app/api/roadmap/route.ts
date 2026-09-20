// GET /api/roadmap?goal=<pathId> : the Gap-to-Goal roadmap (F7).
// Items come from the build_gap_roadmap UC Function and are mirrored into Lakebase so completion
// state survives a refresh.
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseQuery, requireUser } from "@/lib/api";
import { pathById } from "@/lib/catalog";
import { ucFn } from "@/lib/databricks/functions";
import { toRoadmapItem, type RoadmapRow } from "@/lib/dashboard";
import { getProfile, listRoadmapItems, syncRoadmapItems } from "@/lib/db/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

const QuerySchema = z.object({
  goal: z
    .string()
    .regex(/^CP\d{2}$/)
    .optional(),
  days: z.coerce.number().int().min(1).max(365).default(90),
});

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const query = parseQuery(req.url, QuerySchema);
  if (!query.ok) return query.response;

  const profile = await getProfile(auth.user.userId);
  if (!profile) return apiError("profile_required", "Finish onboarding to build a roadmap.");

  const pathId = query.data.goal ?? profile.primaryGoal;
  const path = pathId ? await pathById(pathId) : undefined;
  if (!path) return apiError("bad_request", "Pick a career goal first.");

  const rows = await ucFn<RoadmapRow>("build_gap_roadmap", {
    target_path: path.path_name,
    student_skills: profile.skills.map((s) => s.name).join(", "),
    days_ahead: query.data.days,
  });

  const items = rows.map(toRoadmapItem);
  await syncRoadmapItems(auth.user.userId, path.path_name, items);
  const stored = await listRoadmapItems(auth.user.userId, path.path_name);

  return NextResponse.json({
    goal: { pathId: path.path_id, pathName: path.path_name },
    items: stored,
    hoursPerWeek: profile.preferences.hoursPerWeek,
  });
}
