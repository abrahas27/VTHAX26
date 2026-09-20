"use client";

import { useEffect } from "react";

/**
 * Fire-and-forget warehouse warm-up (spec 14.3, 6.4).
 *
 * The SQL Warehouse auto-stops after ~10 minutes idle and a cold first query costs ~14 s, which
 * is the single worst thing that can happen during a demo. Asking for it on the landing page --
 * while the student is still reading the hero and signing in with Google -- hides most of that
 * behind work they were doing anyway.
 *
 * While a page is open the ping repeats, so a warehouse cannot go cold under an active student.
 * It only runs while the tab is actually visible, because Free Edition bills the warehouse for
 * being up and a forgotten background tab would quietly burn the quota.
 */
export function WarmUp({ intervalMs = 4 * 60_000 }: { intervalMs?: number }) {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/health?warm=1", { cache: "no-store" }).catch(() => undefined);
    };
    ping();
    const timer = setInterval(ping, intervalMs);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [intervalMs]);

  return null;
}
