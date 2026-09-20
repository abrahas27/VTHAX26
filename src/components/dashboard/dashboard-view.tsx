"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ClubCard, EventCard, OpportunityCard, RecruiterTimeline, RoadmapPreview } from "./cards";
import { ItemDrawer, type DrawerItem } from "./item-drawer";
import { ReadinessRing } from "./readiness-ring";
import { CardListSkeleton, Empty, Notice, Section, Stagger, WakingNotice } from "./states";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/client/api";
import { useWaking } from "@/lib/client/waking";
import type { DashboardPayload } from "@/lib/types";

const DAY_FILTERS = [7, 30, 90] as const;

export const dashboardKey = (tab: string, days: number, sections: "core" | "roadmap") =>
  ["dashboard", tab, days, sections] as const;

export const fetchDashboard = (tab: string, days: number, sections: "core" | "roadmap") =>
  apiFetch<DashboardPayload>(`/api/dashboard?tab=${tab}&days=${days}&sections=${sections}`);

/**
 * The For You dashboard (F4). The roadmap is fetched alongside the rest rather than inside it:
 * build_gap_roadmap is consistently the slowest UC Function, and letting it gate the whole page
 * meant every card waited for the one section nobody reads first (spec 6.4).
 */
export function DashboardView({ tab = "for-you" }: { tab?: string }) {
  const [days, setDays] = useState<number>(30);
  const [selected, setSelected] = useState<DrawerItem | null>(null);

  const core = useQuery({
    queryKey: dashboardKey(tab, days, "core"),
    queryFn: () => fetchDashboard(tab, days, "core"),
    // Changing the date range keeps the current cards on screen while the new ones load, so the
    // page never blinks back to skeletons for data it already has.
    placeholderData: keepPreviousData,
  });

  const roadmap = useQuery({
    queryKey: dashboardKey(tab, days, "roadmap"),
    queryFn: () => fetchDashboard(tab, days, "roadmap"),
    placeholderData: keepPreviousData,
  });

  const waking = useWaking(core.isPending);

  if (core.isPending) {
    return (
      <div className="space-y-6">
        {waking && <WakingNotice />}
        <DashboardSkeleton />
      </div>
    );
  }

  if (core.error) {
    return (
      <Section title="Dashboard">
        <Empty
          message={core.error.message}
          actionLabel="Try again"
          onAction={() => void core.refetch()}
        />
      </Section>
    );
  }

  const data = core.data;
  const refreshing = core.isFetching || roadmap.isFetching;

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
              ? ` · median pay $${Math.round(data.goal.medianSalary / 1000)}k (estimated)`
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
                  ? "bg-primary text-primary-foreground focus-visible:ring-ring min-h-11 rounded-full px-4 text-xs focus-visible:ring-2 focus-visible:outline-none"
                  : "bg-surface-2 text-muted-foreground hover:text-foreground focus-visible:ring-ring min-h-11 rounded-full px-4 text-xs focus-visible:ring-2 focus-visible:outline-none"
              }
            >
              {value} days
            </button>
          ))}
        </div>
      </header>

      <span className="sr-only" role="status" aria-live="polite">
        {refreshing ? "Updating your dashboard" : `Showing the next ${days} days`}
      </span>

      {data.demoMode && (
        <Notice>
          Showing recorded demo data — live Databricks results were not available just now.
        </Notice>
      )}
      {data.errors?.length ? (
        <Notice>
          Some sections could not load ({data.errors.join(", ")}). Try again in a moment.
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Stagger index={0}>
          <Section title="Readiness" className="h-full">
            <ReadinessRing score={data.readiness.score} gaps={data.readiness.topGaps} />
          </Section>
        </Stagger>

        <Stagger index={1}>
          <Section title="Up next for you" className="h-full">
            {data.events.length === 0 ? (
              <Empty
                message="Nothing in this range yet."
                actionLabel="Look 90 days ahead"
                onAction={() => setDays(90)}
              />
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
        </Stagger>
      </div>

      <Stagger index={2}>
        <Section title="Recruiters coming to VT" subtitle="Next 45 days">
          <RecruiterTimeline
            visits={data.visits}
            onOpen={(visit) => setSelected({ kind: "visit", item: visit })}
          />
        </Section>
      </Stagger>

      <div className="grid gap-4 lg:grid-cols-2">
        <Stagger index={3}>
          <Section title="Clubs that fit you" className="h-full">
            {data.clubs.length === 0 ? (
              <Empty message="No clubs matched this goal yet. Try the search palette (press /)." />
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
        </Stagger>

        <Stagger index={4}>
          <Section title="Open opportunities" className="h-full">
            {data.opportunities.length === 0 ? (
              <Empty message="No open postings for this goal right now. Widen the date range or ask the chat for related paths." />
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
        </Stagger>
      </div>

      <Stagger index={5}>
        <Section
          title="Gap-to-Goal roadmap"
          subtitle={
            data.readiness.topGaps.length > 0
              ? `Closing ${data.readiness.topGaps.join(", ")}`
              : undefined
          }
        >
          {roadmap.isPending ? (
            <CardListSkeleton count={3} />
          ) : roadmap.error ? (
            <Empty
              message="The roadmap did not load."
              actionLabel="Try again"
              onAction={() => void roadmap.refetch()}
            />
          ) : (
            <RoadmapPreview items={roadmap.data.roadmapPreview.slice(0, 4)} />
          )}
        </Section>
      </Stagger>

      <ItemDrawer selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/** Skeletons shaped like the final cards, never spinners (spec 5.2). */
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3 w-72" />
        </div>
        <Skeleton className="h-11 w-48 rounded-full" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="card-elevated flex flex-col items-center gap-3 p-5">
          <Skeleton className="size-28 rounded-full" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="card-elevated space-y-3 p-5">
          <Skeleton className="h-4 w-32" />
          <CardListSkeleton count={3} />
        </div>
      </div>

      <div className="card-elevated space-y-3 p-5">
        <Skeleton className="h-4 w-44" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 min-w-[190px] rounded-xl" />
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="card-elevated space-y-3 p-5">
            <Skeleton className="h-4 w-36" />
            <CardListSkeleton count={3} />
          </div>
        ))}
      </div>

      <span className="sr-only" role="status">
        Loading your dashboard
      </span>
    </div>
  );
}
