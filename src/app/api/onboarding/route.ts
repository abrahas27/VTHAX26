// POST /api/onboarding : questionnaire answers -> skill profile, fit scores, primary goal (F3).
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseBody, requireUser } from "@/lib/api";
import { careerPaths, pathNameFor, pathSkills, skills as catalogSkills } from "@/lib/catalog";
import { invalidateDashboard } from "@/lib/dashboard-cache";
import { getProfile, saveProfile } from "@/lib/db/queries";
import { fitScore, pickPrimaryGoal } from "@/lib/scoring";
import { normalizeSkills } from "@/lib/skills-normalize";
import type { Preferences, ProfileSkill } from "@/lib/types";

export const runtime = "nodejs";
// Lakebase and the Databricks workspace both live in AWS us-east-2; iad1 is the closest Vercel
// region, so the round trips this route makes are as short as they can be (spec 6.4).
export const preferredRegion = ["iad1"];

const AnswersSchema = z.object({
  seeking: z.array(z.enum(["internship", "full_time", "research", "exploring"])).default([]),
  interestedPaths: z
    .array(z.string().regex(/^CP\d{2}$/))
    .max(19)
    .default([]),
  energizers: z.array(z.string().max(60)).max(6).default([]),
  industries: z.array(z.string().max(60)).max(12).default([]),
  locations: z.array(z.string().max(60)).max(12).default([]),
  hoursPerWeek: z.enum(["1-2", "3-5", "6-10", "10+"]).default("3-5"),
  flags: z
    .object({
      needsSponsorship: z.boolean().optional(),
      gpaConcerns: z.boolean().optional(),
      firstGen: z.boolean().optional(),
      transfer: z.boolean().optional(),
    })
    .default({}),
});

const BodySchema = z.object({
  answers: AnswersSchema,
  /** Q8: self-rated levels for the top skills of the leading path, keyed by canonical skill name. */
  selfRatings: z.record(z.string(), z.number().int().min(1).max(4)).default({}),
  primaryGoal: z
    .string()
    .regex(/^CP\d{2}$/)
    .nullable()
    .optional(),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, BodySchema);
  if (!body.ok) return body.response;

  // The profile read and the three catalog reads are independent; a cold instance would
  // otherwise pay for Lakebase and then for Databricks, one after the other.
  const [profile, paths, requirements, canonical] = await Promise.all([
    getProfile(auth.user.userId),
    careerPaths(),
    pathSkills(),
    catalogSkills(),
  ]);
  if (!profile)
    return apiError("profile_required", "Upload a resume before answering the questions.");

  // Self-ratings only fill gaps: a resume-backed skill keeps its evidence and the higher level.
  const rated = normalizeSkills(
    Object.entries(body.data.selfRatings).map(([name, level]) => ({ name, level_guess: level })),
    canonical,
    "questionnaire",
  );
  const merged = mergeSkills(profile.skills, rated.skills);

  const preferences: Preferences = body.data.answers;
  const fitScores: Record<string, number> = {};
  for (const path of paths) {
    fitScores[path.path_id] = fitScore({
      path,
      requirements: requirements.filter((r) => r.path_id === path.path_id),
      skills: merged,
      preferences,
      majorCode: profile.majorCode,
    });
  }

  const primaryGoal =
    body.data.primaryGoal ?? pickPrimaryGoal(fitScores, preferences.interestedPaths);

  await saveProfile({
    userId: auth.user.userId,
    skills: merged,
    preferences,
    fitScores,
    primaryGoal,
    primaryGoalName: await pathNameFor(primaryGoal),
    markOnboarded: true,
  });
  invalidateDashboard(auth.user.userId);

  return NextResponse.json({
    profile: { ...profile, skills: merged, preferences, fitScores, primaryGoal },
    fitScores,
    primaryGoal,
  });
}

/** Keep every resume skill; add self-rated ones, raising the level when the student rates higher. */
function mergeSkills(existing: ProfileSkill[], rated: ProfileSkill[]): ProfileSkill[] {
  const byName = new Map(existing.map((s) => [s.name.toLowerCase(), { ...s }]));
  for (const skill of rated) {
    const current = byName.get(skill.name.toLowerCase());
    if (current) {
      current.level = Math.max(current.level, skill.level) as ProfileSkill["level"];
    } else {
      byName.set(skill.name.toLowerCase(), skill);
    }
  }
  return [...byName.values()];
}
