// src/lib/demo.ts : DEMO_MODE fallback (spec 14.4). Serves fixtures recorded from real responses,
// so a cold warehouse, a quota, or hotel wifi cannot break the demo.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import type { DashboardPayload } from "@/lib/types";

export const isDemoMode = () => env.DEMO_MODE === "true";

const FIXTURE_DIR = path.join(process.cwd(), "fixtures", "demo");

/** Read a recorded fixture, or null when it has not been recorded yet. */
export async function readFixture<T>(name: string): Promise<T | null> {
  try {
    const raw = await readFile(path.join(FIXTURE_DIR, `${name}.json`), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Dashboard fixture for a tab; `for-you` falls back to the primary demo goal. */
export async function demoDashboard(tab: string): Promise<DashboardPayload | null> {
  const payload =
    (await readFixture<DashboardPayload>(`dashboard-${tab}`)) ??
    (tab === "for-you" ? await readFixture<DashboardPayload>("dashboard-for-you") : null);
  return payload ? { ...payload, demoMode: true } : null;
}
