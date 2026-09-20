// src/lib/dashboard-cache.ts : short-lived per-user cache for /api/dashboard (spec 6.3, 6.4).
import "server-only";
import { ttlCache } from "@/lib/cache";
import type { DashboardPayload } from "@/lib/types";

/**
 * The same tab is requested again on every back-navigation, tab switch and day-filter toggle, and
 * it costs five or six warehouse queries each time. A minute of reuse per warm instance is short
 * enough that a profile edit (which clears the entry) is never invisible, and long enough to carry
 * a demo's worth of clicking without touching Databricks again.
 */
const cache = ttlCache<DashboardPayload>(60_000);

export const cacheKey = (userId: string, tab: string, days: number, sections: string) =>
  `${userId}:${tab}:${days}:${sections}`;

export const cachedDashboard = (key: string, build: () => Promise<DashboardPayload>) =>
  cache.get(key, build);

/** Called after anything that changes what a dashboard would show (profile, goal, tabs). */
export function invalidateDashboard(userId: string): void {
  cache.clearWhere((key) => key.startsWith(`${userId}:`));
}
