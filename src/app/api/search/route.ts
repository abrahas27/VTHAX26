// GET /api/search : semantic search + calendar export, search half (spec F10, 9, 11.7).
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseQuery, requireUser } from "@/lib/api";
import { search } from "@/lib/search";

export const runtime = "nodejs";

const KINDS = ["events", "opportunities", "clubs"] as const;

const QuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()) : [...KINDS]))
    .pipe(z.array(z.enum(KINDS))),
});

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = parseQuery(req.url, QuerySchema);
  if (!parsed.ok) return parsed.response;
  const { q, types } = parsed.data;

  try {
    const result = await search(q, {
      events: types.includes("events"),
      opportunities: types.includes("opportunities"),
      clubs: types.includes("clubs"),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[search] query failed", err);
    return apiError("upstream_error", "Search is unavailable right now. Try again in a moment.");
  }
}
