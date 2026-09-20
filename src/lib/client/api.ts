"use client";

/**
 * src/lib/client/api.ts : the browser half of the API contract (spec 9).
 * Every route answers errors as `{ error: { code, message } }`; this turns one into a thrown
 * Error carrying a message written for a student, so no component ever renders a raw status code
 * or a stack (spec 5.6).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

const FRIENDLY: Record<string, string> = {
  unauthorized: "Your session expired. Sign in again to keep going.",
  profile_required: "Finish onboarding first and this will fill in.",
  upstream_error: "Our live data is having a moment. Try again in a few seconds.",
  not_configured: "This part of HireUp is not switched on yet.",
  forbidden: "You do not have access to this.",
};

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    // A dropped connection has no body to read; say something a student can act on.
    throw new ApiError("You look offline. Check your connection and try again.", "offline", 0);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    const code = body?.error?.code ?? "upstream_error";
    throw new ApiError(
      body?.error?.message ?? FRIENDLY[code] ?? "Something went wrong. Try again.",
      code,
      res.status,
    );
  }
  return (await res.json()) as T;
}
