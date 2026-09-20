// PATCH /api/roadmap/:id : tick a roadmap item off (F7).
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseBody, requireUser } from "@/lib/api";
import { setRoadmapItemCompleted } from "@/lib/db/queries";

export const runtime = "nodejs";
// Lakebase and the Databricks workspace both live in AWS us-east-2; iad1 is the closest Vercel
// region, so the round trips this route makes are as short as they can be (spec 6.4).
export const preferredRegion = ["iad1"];

const BodySchema = z.object({ completed: z.boolean() });

export async function PATCH(req: Request, { params }: RouteContext<"/api/roadmap/[id]">) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, BodySchema);
  if (!body.ok) return body.response;

  const { id } = await params;
  const item = await setRoadmapItemCompleted(auth.user.userId, id, body.data.completed);
  if (!item) return apiError("not_found", "That roadmap item is not on your plan.");
  return NextResponse.json({ item });
}
