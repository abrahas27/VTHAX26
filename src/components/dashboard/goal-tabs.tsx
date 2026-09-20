"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import type { DashboardSpec } from "@/lib/agent/dashboard-spec";

/**
 * Tab strip with AI-created tabs (spec 7.3, F6). A newly created tab slides in with an orange
 * glow, which is the hero moment of the demo.
 */
export function GoalTabs({
  tabs,
  active,
  newTabId,
  onSelect,
  onHover,
  onClose,
}: {
  tabs: DashboardSpec[];
  active: string;
  newTabId?: string | null;
  onSelect: (tabId: string) => void;
  /** Prefetch this tab's data while the pointer is still on its way (spec 5.2). */
  onHover?: (tabId: string) => void;
  onClose: (tabId: string) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={active === "for-you"}
        onClick={() => onSelect("for-you")}
        className={
          active === "for-you"
            ? "bg-primary text-primary-foreground shrink-0 rounded-full px-3 py-1.5 text-xs font-medium"
            : "bg-surface-2 text-muted-foreground hover:text-foreground shrink-0 rounded-full px-3 py-1.5 text-xs"
        }
        onPointerEnter={() => onHover?.("for-you")}
      >
        For You
      </button>

      <AnimatePresence initial={false}>
        {tabs.map((tab) => {
          const isActive = active === tab.tab_id;
          const isNew = newTabId === tab.tab_id;
          return (
            <motion.div
              key={tab.tab_id}
              layout
              initial={reduceMotion ? false : { opacity: 0, x: 24, scale: 0.96 }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
                boxShadow:
                  isNew && !reduceMotion ? "0 0 0 3px var(--hp-accent)" : "0 0 0 0 transparent",
              }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", duration: 0.35, boxShadow: { duration: 1.5 } }}
              className="shrink-0 rounded-full"
            >
              <span
                className={
                  isActive
                    ? "bg-accent text-accent-foreground flex items-center gap-1 rounded-full py-1.5 pr-1.5 pl-3 text-xs font-medium"
                    : "bg-surface-2 text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-full py-1.5 pr-1.5 pl-3 text-xs"
                }
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onSelect(tab.tab_id)}
                  onPointerEnter={() => onHover?.(tab.tab_id)}
                  onFocus={() => onHover?.(tab.tab_id)}
                  className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
                >
                  {tab.title}
                </button>
                <button
                  type="button"
                  aria-label={`Close ${tab.title} tab`}
                  onClick={() => onClose(tab.tab_id)}
                  className="hover:bg-background/20 focus-visible:ring-ring rounded-full p-0.5 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
