"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Animated radial readiness score with the top gaps beneath it (spec 7.3, F4).
 * The ring animates from its previous value so completing a roadmap item reads as progress.
 */
export function ReadinessRing({
  score,
  label = "Readiness",
  gaps = [],
  size = 128,
}: {
  score: number;
  label?: string;
  gaps?: string[];
  size?: number;
}) {
  const reduceMotion = useReducedMotion();
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="flex items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`${label} ${clamped} out of 100`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={stroke}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--hp-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: reduceMotion ? offset : circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: reduceMotion ? 0 : 0.8, ease: "easeOut" }}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums">{clamped}</span>
          <span className="text-muted-foreground text-xs">/ 100</span>
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {gaps.length > 0 ? (
          <p className="text-muted-foreground mt-1 text-xs">
            Top gaps: <span className="text-foreground">{gaps.join(", ")}</span>
          </p>
        ) : (
          <p className="text-muted-foreground mt-1 text-xs">No gaps for this path yet.</p>
        )}
      </div>
    </div>
  );
}
