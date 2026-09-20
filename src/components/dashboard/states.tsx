"use client";

import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** A card section. `action` gives an empty or failed section one clear thing to do (spec 5.6). */
export function Section({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card-elevated p-5 ${className ?? ""}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base">{title}</h2>
        {subtitle && <span className="text-muted-foreground truncate text-xs">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

/** Never a dead end: every empty state names the one thing that would fill it. */
export function Empty({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-2">
      <p className="text-muted-foreground text-sm">{message}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function Notice({
  tone = "warning",
  children,
}: {
  tone?: "warning" | "info";
  children: React.ReactNode;
}) {
  return (
    <p
      role="status"
      className={
        tone === "warning"
          ? "border-warning/40 text-warning flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"
          : "border-border text-muted-foreground flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"
      }
    >
      {tone === "warning" ? (
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
      )}
      {children}
    </p>
  );
}

/** The SQL Warehouse auto-stops after ~10 min idle; this is what that looks like (spec 14.3). */
export function WakingNotice() {
  return (
    <Notice tone="info">
      Waking up live data from Databricks. This takes a few seconds the first time.
    </Notice>
  );
}

/** Cards appear in sequence rather than all at once, unless the student asked for less motion. */
export function Stagger({
  index,
  children,
  className,
}: {
  index: number;
  children: React.ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: reduceMotion ? 0 : Math.min(index, 6) * 0.05 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** A skeleton shaped like an EventCard / OpportunityCard, not a grey rectangle (spec 5.2). */
export function CardSkeleton() {
  return (
    <div className="border-border space-y-2 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
      <Skeleton className="h-3 w-2/3" />
      <div className="flex gap-1.5 pt-1">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
    </div>
  );
}

export function CardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
