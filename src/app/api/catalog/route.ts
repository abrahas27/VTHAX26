// GET /api/catalog : career paths, skills, majors (cached 10 min in lib/catalog).
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { careerPaths, majors, skills } from "@/lib/catalog";

export const runtime = "nodejs";
// Lakebase and the Databricks workspace both live in AWS us-east-2; iad1 is the closest Vercel
// region, so the round trips this route makes are as short as they can be (spec 6.4).
export const preferredRegion = ["iad1"];

export async function GET() {
  try {
    const [paths, skillList, majorList] = await Promise.all([careerPaths(), skills(), majors()]);
    return NextResponse.json({ paths, skills: skillList, majors: majorList });
  } catch (err) {
    console.error("[catalog] failed", err);
    return apiError("upstream_error", "Could not load the catalog from Databricks.");
  }
}
