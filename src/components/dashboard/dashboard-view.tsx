"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ClubCard, EventCard, OpportunityCard, RecruiterTimeline, RoadmapPreview } from "./cards";
import { ItemDrawer, type DrawerItem } from "./item-drawer";
import { ReadinessRing } from "./readiness-ring";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardPayload } from "@/lib/types";

const DAY_FILTERS = [7, 30, 90] as const;

async function fetchDashboard(tab: string, days: number): Promise<DashboardPayload> {
  const res = await fetch(`/api/dashboard?tab=${tab}&days=${days}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? "Could not load your dashboard.");
  }
  return (await res.json()) as DashboardPayload;
}

export function DashboardView({ tab = "for-you" }: { tab?: string }) {
  const [days, setDays] = useState<number>(30);
  const [selected, setSelected] = useState<DrawerItem | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ["dashboard", tab, days],
    queryFn: () => fetchDashboard(tab, days),
  });

  if (isPending) return <DashboardSkeleton />;

  if (error) {
    return (
      <Section title="Dashboard">
        <p className="text-muted-foreground text-sm">{error.message}</p>
      </Section>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl">{data.goal.pathName ?? "Your dashboard"}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {data.goal.pathName
              ? `Primary goal · ${data.goal.pathName}`
              : "Pick a goal to focus your plan."}
            {data.goal.medianSalary
              ? ` · median pay $${Math.round(data.goal.medianSalary / 1000)}k (mock)`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Date range">
          {DAY_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value)}
              aria-pressed={days === value}
              className={
                days === value
                  ? "bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs"
                  : "bg-surface-2 text-muted-foreground hover:text-foreground rounded-full px-3 py-1 text-xs"
              }
            >
              {value} days
            </button>
          ))}
        </div>
      </header>

      {data.demoMode && (
        <p className="border-warning/40 text-warning flex items-center gap-2 rounded-xl border px-3 py-2 text-xs">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          Demo mode: showing recorded data.
        </p>
      )}
      {data.errors?.length ? (
        <p className="border-warning/40 text-warning flex items-center gap-2 rounded-xl border px-3 py-2 text-xs">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          Some sections could not load ({data.errors.join(", ")}). Try again in a moment.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Section title="Readiness">
          <ReadinessRing score={data.readiness.score} gaps={data.readiness.topGaps} />
        </Section>

        <Section title="Up next for you">
          {data.events.length === 0 ? (
            <Empty message="No events in this range. Try a broader date range." />
          ) : (
            <div className="space-y-2">
              {data.events.slice(0, 6).map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onOpen={() => setSelected({ kind: "event", item: event })}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="Recruiters coming to VT" subtitle="Next 45 days">
        <RecruiterTimeline
          visits={data.visits}
          onOpen={(visit) => setSelected({ kind: "visit", item: visit })}
        />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Clubs that fit you">
          {data.clubs.length === 0 ? (
            <Empty message="No clubs matched this goal yet." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.clubs.map((club) => (
                <ClubCard
                  key={club.id}
                  club={club}
                  onOpen={() => setSelected({ kind: "club", item: club })}
                />
              ))}
            </div>
          )}
        </Section>

        <Section title="Open opportunities">
          {data.opportunities.length === 0 ? (
            <Empty message="No open postings for this goal right now." />
          ) : (
            <div className="space-y-2">
              {data.opportunities.slice(0, 6).map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  onOpen={() => setSelected({ kind: "opportunity", item: opportunity })}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section
        title="Gap-to-Goal roadmap"
        subtitle={
          data.readiness.topGaps.length > 0
            ? `Closing ${data.readiness.topGaps.join(", ")}`
            : undefined
        }
      >
        <RoadmapPreview items={data.roadmapPreview.slice(0, 4)} />
      </Section>

      <ItemDrawer selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-elevated p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base">{title}</h2>
        {subtitle && <span className="text-muted-foreground truncate text-xs">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="text-muted-foreground text-sm">{message}</p>;
}

/** Skeletons shaped like the final cards, never spinners (spec 5.2). */
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-44 rounded-2xl" />
      </div>
      <Skeleton className="h-32 rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
      <span className="sr-only" role="status">
        Loading your dashboard
      </span>
    </div>
  );
}
