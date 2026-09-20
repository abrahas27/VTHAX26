// GET/PUT /api/profile : read and edit the student's profile (F2 review screen, /profile page).
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseBody, requireUser } from "@/lib/api";
import { pathNameFor } from "@/lib/catalog";
import { getProfile, saveProfile } from "@/lib/db/queries";

export const runtime = "nodejs";

const SkillSchema = z.object({
  name: z.string().min(1).max(120),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  evidence: z.string().max(400).optional(),
  source: z.enum(["resume", "self", "questionnaire"]).default("self"),
  canonical: z.boolean().default(false),
});

const UpdateSchema = z.object({
  majorCode: z.string().max(12).nullable().optional(),
  classYear: z
    .enum(["Freshman", "Sophomore", "Junior", "Senior", "Graduate"])
    .nullable()
    .optional(),
  skills: z.array(SkillSchema).max(120).optional(),
  primaryGoal: z
    .string()
    .regex(/^CP\d{2}$/)
    .nullable()
    .optional(),
});

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const profile = await getProfile(auth.user.userId);
  if (!profile) return apiError("not_found", "No profile yet. Upload a resume to get started.");
  return NextResponse.json(profile);
}

export async function PUT(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, UpdateSchema);
  if (!body.ok) return body.response;

  await saveProfile({
    userId: auth.user.userId,
    ...body.data,
    primaryGoalName: body.data.primaryGoal ? await pathNameFor(body.data.primaryGoal) : null,
  });
  const profile = await getProfile(auth.user.userId);
  return NextResponse.json(profile);
}
