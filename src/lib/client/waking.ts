"use client";

import { useEffect, useState } from "react";

/**
 * True once a load has been running long enough that a cold SQL Warehouse is the likely reason
 * (a cold first query costs ~14 s; a warm one answers in about one). The dashboard shows
 * "Waking up live data..." rather than leaving a skeleton sitting there looking broken, which is
 * the difference between a slow demo and a demo that looks stuck (spec 5.6, 14.3).
 */
export function useWaking(pending: boolean, afterMs = 3_500): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setElapsed(true), afterMs);
    // Reset on the way out rather than in the effect body, so the next slow load starts its own
    // clock instead of inheriting this one's verdict.
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [pending, afterMs]);

  return pending && elapsed;
}
