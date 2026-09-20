// src/lib/timing.ts : per-request timing (spec 6.4 measurement pass). Low-level clients
// (sql.ts, lakebase.ts, vector.ts) call `timed()` around their actual work; a route wraps its
// whole handler once in `withTiming()`, and every timed() call anywhere in that call tree --
// however deep, across awaits -- is collected automatically via AsyncLocalStorage. No timing
// object needs to be threaded through function signatures.
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

interface Entry {
  name: string;
  ms: number;
}

class TimingContext {
  entries: Entry[] = [];
  readonly start = performance.now();
  record(name: string, ms: number) {
    this.entries.push({ name, ms: Math.round(ms * 10) / 10 });
  }
}

const als = new AsyncLocalStorage<TimingContext>();

/** Times one step. A no-op wrapper (still runs `fn`) outside any `withTiming` call. */
export async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const ctx = als.getStore();
  if (!ctx) return fn();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    ctx.record(name, performance.now() - t0);
  }
}

/** Records a duration already measured elsewhere (e.g. time-to-first-token from a stream). */
export function recordTiming(name: string, ms: number): void {
  als.getStore()?.record(name, ms);
}

const HEADER_UNSAFE = /[^a-zA-Z0-9_-]/g;

export interface TimingResult<T> {
  result: T;
  serverTiming: string;
  totalMs: number;
  steps: Entry[];
}

/**
 * Runs `handler` inside a fresh timing context, then returns a Server-Timing header value and
 * logs one structured JSON line (route, totalMs, every step). Route handlers call this once,
 * wrapping their entire body.
 */
export async function withTiming<T>(
  route: string,
  handler: () => Promise<T>,
  extra: Record<string, unknown> = {},
): Promise<TimingResult<T>> {
  const ctx = new TimingContext();
  const result = await als.run(ctx, handler);
  const totalMs = Math.round(performance.now() - ctx.start);
  const serverTiming = [
    ...ctx.entries.map(
      (e, i) => `${e.name.replace(HEADER_UNSAFE, "_")}_${i};dur=${e.ms}`,
    ),
    `total;dur=${totalMs}`,
  ].join(", ");
  console.log(JSON.stringify({ route, totalMs, steps: ctx.entries, ...extra }));
  return { result, serverTiming, totalMs, steps: ctx.entries };
}

/** Best-effort table-name label for a SQL statement, so Server-Timing entries read e.g. "sql:events". */
export function sqlLabel(prefix: string, statement: string): string {
  const m = statement.match(/(?:FROM|INTO|UPDATE|TABLE)\s+([a-zA-Z0-9_.]+)/i);
  const name = m?.[1]?.split(".").pop() ?? "query";
  return `${prefix}:${name}`;
}
