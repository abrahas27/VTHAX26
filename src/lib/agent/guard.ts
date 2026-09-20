// src/lib/agent/guard.ts : input and output guards for the agent (spec 10.8).

export const MAX_MESSAGE_CHARS = 2000;

/** Cap length and strip HTML so a message cannot smuggle markup into the transcript. */
export function sanitizeUserMessage(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);
}

/**
 * Ids the agent may cite: catalog items (EV0037, CL001, OP0059, CO011, RV0001) and course codes
 * (FIN 4114, CS 3114), which build_gap_roadmap returns as roadmap item ids. Course codes are
 * validated the same way, so a made-up course cannot slip through as plain text.
 */
const ID_PATTERN = /\[([A-Z]{2}\d{3,4}|[A-Z]{2,4} ?\d{4})\]/g;

export function referencedIds(text: string): string[] {
  return [...text.matchAll(ID_PATTERN)].map((match) => match[1] as string);
}

export interface GuardResult {
  text: string;
  /** Ids the model cited that no tool returned this turn; logged and stripped. */
  invalidIds: string[];
}

/**
 * Spec 10.8: after the stream, flag any [ID] that was not returned by a tool in this turn.
 * An invented id is removed rather than rendered, since a chip that cannot be hydrated is
 * exactly the hallucination the grounding rule exists to prevent.
 */
export function applyOutputGuard(text: string, seenIds: Set<string>): GuardResult {
  const invalidIds: string[] = [];
  const cleaned = text.replace(ID_PATTERN, (match, id: string) => {
    if (seenIds.has(id)) return match;
    invalidIds.push(id);
    return ""; // drop the citation, keep the surrounding sentence
  });
  return {
    text: invalidIds.length > 0 ? cleaned.replace(/ {2,}/g, " ").replace(/ ([.,;:])/g, "$1") : text,
    invalidIds,
  };
}

/**
 * In-memory token bucket: 20 turns per user per 10 minutes (spec 10.8). Per-instance only,
 * which is fine for a hackathon; Upstash Redis is the documented upgrade (spec 12.8).
 */
const WINDOW_MS = 10 * 60_000;
const LIMIT = 20;
const buckets = new Map<string, number[]>();

export function rateLimit(userId: string, now = Date.now()): { ok: boolean; retryAfterMs: number } {
  const hits = (buckets.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= LIMIT) {
    const oldest = hits[0] ?? now;
    return { ok: false, retryAfterMs: WINDOW_MS - (now - oldest) };
  }
  hits.push(now);
  buckets.set(userId, hits);
  return { ok: true, retryAfterMs: 0 };
}

/** Test seam. */
export function resetRateLimits() {
  buckets.clear();
}
