// GET /api/catalog : career paths, skills, majors (cached 10 min in lib/catalog).
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { careerPaths, majors, skills } from "@/lib/catalog";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [paths, skillList, majorList] = await Promise.all([careerPaths(), skills(), majors()]);
    return NextResponse.json({ paths, skills: skillList, majors: majorList });
  } catch (err) {
    console.error("[catalog] failed", err);
    return apiError("upstream_error", "Could not load the catalog from Databricks.");
  }
}
