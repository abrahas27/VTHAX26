// PATCH /api/roadmap/:id : tick a roadmap item off (F7).
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseBody, requireUser } from "@/lib/api";
import { setRoadmapItemCompleted } from "@/lib/db/queries";

export const runtime = "nodejs";

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
