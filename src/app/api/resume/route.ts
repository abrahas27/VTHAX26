// POST /api/resume : upload + AI parsing (F2). The file is parsed in memory and never stored.
import { NextResponse } from "next/server";
import { apiError, requireUser } from "@/lib/api";
import { majors, skills } from "@/lib/catalog";
import { llmConfigured } from "@/lib/databricks/llm";
import { saveProfile } from "@/lib/db/queries";
import { extractText, MAX_RESUME_BYTES, parseResume, ResumeError } from "@/lib/resume";
import { timed, withTiming } from "@/lib/timing";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!llmConfigured()) {
    return apiError("not_configured", "Set DATABRICKS_LLM_ENDPOINT to parse resumes (spec 11.5).");
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const entry = form.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    return apiError("bad_request", "Expected a multipart form with a `file` field.");
  }
  if (!file) return apiError("bad_request", "Attach a PDF or DOCX resume as `file`.");
  if (file.size > MAX_RESUME_BYTES)
    return apiError("bad_request", "That file is larger than 5 MB.");

  const { result, serverTiming } = await withTiming(
    "/api/resume",
    async () => {
      try {
        const text = await timed("extract-text", () => extractText(file as File));
        const [skillList, majorList] = await Promise.all([skills(), majors()]);
        const parsed = await parseResume(text, skillList, majorList);

        // Store the parsed profile and raw text; only the file NAME is kept, never the file.
        await saveProfile({
          userId: auth.user.userId,
          majorCode: parsed.majorCode,
          classYear: parsed.classYear,
          skills: parsed.skills,
          resumeFileName: (file as File).name,
          resumeText: text.slice(0, 50_000),
        });

        return NextResponse.json({
          profileDraft: {
            displayName: parsed.extracted.name ?? auth.user.displayName,
            majorCode: parsed.majorCode,
            classYear: parsed.classYear,
            skills: parsed.skills,
            experiences: parsed.extracted.experiences,
            projects: parsed.extracted.projects,
            clubs: parsed.extracted.clubs,
            gpa: parsed.extracted.gpa,
          },
          unmatchedSkills: parsed.unmatchedSkills,
          fileName: (file as File).name,
        });
      } catch (err) {
        if (err instanceof ResumeError) {
          return apiError(err.code === "too_large" ? "bad_request" : "bad_request", err.message, {
            reason: err.code,
          });
        }
        console.error("[resume] failed", err);
        return apiError("upstream_error", "Resume parsing failed. Try again in a moment.");
      }
    },
    { userId: auth.user.userId, fileSize: file.size },
  );
  result.headers.set("Server-Timing", serverTiming);
  return result;
}
