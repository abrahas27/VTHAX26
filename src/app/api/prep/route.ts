// POST /api/prep : Event Prep Mode (spec F9, 10.5). Generates a pitch, 3 questions, and 3 talking
// points for one event, grounded only in the event/company rows and the student's profile.
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseBody, requireUser } from "@/lib/api";
import { careerPaths } from "@/lib/catalog";
import { llmConfigured } from "@/lib/databricks/llm";
import { getEventPrep, getProfile, saveEventPrep } from "@/lib/db/queries";
import { EventNotFoundError, generateEventPrep } from "@/lib/prep";

export const runtime = "nodejs";
export const maxDuration = 60;
// Lakebase and the Databricks workspace both live in AWS us-east-2; iad1 is the closest Vercel
// region, so the round trips this route makes are as short as they can be (spec 6.4).
export const preferredRegion = ["iad1"];

const BodySchema = z.object({ eventId: z.string().regex(/^EV\d{3,4}$/) });

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!llmConfigured()) {
    return apiError("not_configured", "Set DATABRICKS_LLM_ENDPOINT to use Event Prep (spec 11.5).");
  }

  const body = await parseBody(req, BodySchema);
  if (!body.ok) return body.response;
  const { eventId } = body.data;

  // Three independent reads: the student's profile, any prep we already generated for this
  // event, and the path catalog the prompt needs. Serially they cost three round trips before
  // the model call can even start.
  const [profile, cached, paths] = await Promise.all([
    getProfile(auth.user.userId),
    getEventPrep(auth.user.userId, eventId),
    careerPaths(),
  ]);
  if (!profile) return apiError("profile_required", "Finish onboarding before using Event Prep.");

  if (cached) {
    return NextResponse.json({
      pitch: cached.pitch,
      questions: cached.questions,
      talkingPoints: cached.talking_points,
      cached: true,
    });
  }

  try {
    const pathNames = Object.fromEntries(paths.map((p) => [p.path_id, p.path_name]));
    const prep = await generateEventPrep(eventId, profile, pathNames);
    await saveEventPrep({
      userId: auth.user.userId,
      eventId,
      pitch: prep.pitch,
      questions: prep.questions,
      talkingPoints: prep.talking_points,
    });
    return NextResponse.json({
      pitch: prep.pitch,
      questions: prep.questions,
      talkingPoints: prep.talking_points,
      cached: false,
    });
  } catch (err) {
    if (err instanceof EventNotFoundError) {
      return apiError("not_found", "That event no longer exists.");
    }
    console.error("[prep] generation failed", err);
    return apiError("upstream_error", "Could not generate prep notes right now. Try again.");
  }
}
