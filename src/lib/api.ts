// src/lib/api.ts : shared Route Handler helpers. Errors are always { error: { code, message } }.
import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { auth } from "@/lib/auth";

export { settle } from "@/lib/settle";

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "bad_request"
  | "not_found"
  | "profile_required"
  | "upstream_error"
  | "not_configured";

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  bad_request: 400,
  not_found: 404,
  profile_required: 409,
  upstream_error: 502,
  not_configured: 503,
};

export function apiError(code: ErrorCode, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status: STATUS[code] });
}

export interface SessionUser {
  userId: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
}

/**
 * Resolve the signed-in user. `src/proxy.ts` already rejected anonymous requests; this also
 * covers the case where the session exists but Lakebase never issued a userId.
 */
export async function requireUser(): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, response: apiError("unauthorized", "Sign in to continue.") };
  }
  if (!session.userId) {
    return {
      ok: false,
      response: apiError(
        "not_configured",
        "Your account is not linked to the database yet. Check that Lakebase is reachable (/api/health).",
      ),
    };
  }
  return {
    ok: true,
    user: {
      userId: session.userId,
      email: session.user.email,
      displayName: session.user.name ?? session.user.email,
      isAdmin: session.isAdmin,
    },
  };
}

/** Parse and validate a JSON body, returning a 400 with the field paths on failure. */
export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: apiError("bad_request", "Expected a JSON body.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: apiError("bad_request", issuesToMessage(parsed.error)) };
  }
  return { ok: true, data: parsed.data };
}

export function parseQuery<T>(
  url: string,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const params = Object.fromEntries(new URL(url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, response: apiError("bad_request", issuesToMessage(parsed.error)) };
  }
  return { ok: true, data: parsed.data };
}

function issuesToMessage(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ");
}
