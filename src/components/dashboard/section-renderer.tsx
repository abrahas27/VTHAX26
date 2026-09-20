"use client";

import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ClubCard, EventCard, OpportunityCard, RoadmapPreview } from "./cards";
import { ReadinessRing } from "./readiness-ring";
import { CardListSkeleton, Empty } from "./states";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/client/api";
import { collectIds, type DashboardSpec, type Section } from "@/lib/agent/dashboard-spec";
import type { ClubItem, DashboardPayload, EventItem, OpportunityItem } from "@/lib/types";
import type { DrawerItem } from "./item-drawer";

interface HydratedItems {
  events: Record<string, EventItem>;
  clubs: Record<string, ClubItem>;
  opportunities: Record<string, OpportunityItem>;
}

const hydrate = (spec: DashboardSpec): Promise<HydratedItems> =>
  apiFetch<HydratedItems>("/api/items/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collectIds(spec)),
  });

/**
 * Renders a goal tab from its DashboardSpec (spec 10.6). The spec supplies IDs and section order;
 * every fact on screen comes from /api/items/batch or from the server-computed dashboard payload,
 * never from the model's text.
 */
export function SectionRenderer({
  spec,
  computed,
  roadmap,
  onOpen,
}: {
  spec: DashboardSpec;
  /** Server-computed readiness and gaps for this path (the "core" dashboard payload). */
  computed?: DashboardPayload;
  /** The roadmap arrives in its own request, so the slowest UC Function cannot gate this tab. */
  roadmap?: { data?: DashboardPayload; isPending: boolean };
  onOpen: (item: DrawerItem) => void;
}) {
  const reduceMotion = useReducedMotion();
  const { data, isPending, error } = useQuery({
    queryKey: ["tab-items", spec.tab_id, JSON.stringify(collectIds(spec))],
    queryFn: () => hydrate(spec),
  });

  return (
    <div className="space-y-4">
      <header className="card-elevated p-5">
        <h1 className="text-xl">{spec.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {computed?.goal.medianSalary
            ? `Median pay $${Math.round(computed.goal.medianSalary / 1000)}k (mock)`
            : "Career path"}
          {computed ? ` · Readiness ${computed.readiness.score}` : ""}
        </p>
        <p className="text-muted-foreground mt-2 text-xs italic">
          Built by HokiePath AI from: &ldquo;{spec.source_question}&rdquo;
        </p>
      </header>

      {error && (
        <p className="border-warning/40 text-warning rounded-xl border px-3 py-2 text-xs">
          {error.message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {spec.sections.map((section, index) => (
          <motion.section
            key={`${section.type}-${index}`}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : index * 0.04 }}
            className="card-elevated p-5"
          >
            <SectionBody
              section={section}
              computed={computed}
              roadmap={roadmap}
              items={data}
              loading={isPending}
              onOpen={onOpen}
            />
          </motion.section>
        ))}
      </div>
    </div>
  );
}

function SectionBody({
  section,
  computed,
  roadmap,
  items,
  loading,
  onOpen,
}: {
  section: Section;
  computed?: DashboardPayload;
  roadmap?: { data?: DashboardPayload; isPending: boolean };
  items?: HydratedItems;
  loading: boolean;
  onOpen: (item: DrawerItem) => void;
}) {
  switch (section.type) {
    case "readiness":
      return (
        <>
          <h2 className="mb-3 text-base">Readiness</h2>
          <ReadinessRing
            score={computed?.readiness.score ?? 0}
            gaps={computed?.readiness.topGaps ?? []}
          />
        </>
      );

    case "skill_gap": {
      const gaps = (computed?.gaps ?? []).filter((g) => !g.hasSkill).slice(0, 8);
      return (
        <>
          <h2 className="mb-3 text-base">Your skill gaps</h2>
          {gaps.length === 0 ? (
            <p className="text-muted-foreground text-sm">No gaps for this path.</p>
          ) : (
            <ul className="space-y-1.5">
              {gaps.map((gap) => (
                <li key={gap.skillName} className="flex items-center justify-between text-sm">
                  <span>{gap.skillName}</span>
                  <span className="text-muted-foreground text-xs">
                    {Math.round(gap.importance * 100)}% important
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    }

    case "roadmap":
      return (
        <>
          <h2 className="mb-3 text-base">Gap-to-Goal roadmap</h2>
          {roadmap?.isPending ? (
            <CardListSkeleton count={3} />
          ) : (
            <RoadmapPreview items={(roadmap?.data?.roadmapPreview ?? []).slice(0, 6)} />
          )}
        </>
      );

    case "event_list":
      return (
        <>
          <h2 className="mb-3 text-base">{section.title}</h2>
          <ItemList
            loading={loading}
            ids={section.event_ids}
            render={(id) => {
              const event = items?.events[id];
              return event ? (
                <EventCard
                  key={id}
                  event={event}
                  onOpen={() => onOpen({ kind: "event", item: event })}
                />
              ) : null;
            }}
          />
        </>
      );

    case "company_radar":
      return (
        <>
          <h2 className="mb-3 text-base">{section.title}</h2>
          <ItemList
            loading={loading}
            ids={section.visit_event_ids}
            render={(id) => {
              const event = items?.events[id];
              return event ? (
                <EventCard
                  key={id}
                  event={event}
                  onOpen={() => onOpen({ kind: "event", item: event })}
                />
              ) : null;
            }}
          />
        </>
      );

    case "club_grid":
      return (
        <>
          <h2 className="mb-3 text-base">Clubs</h2>
          <ItemList
            loading={loading}
            ids={section.club_ids}
            render={(id) => {
              const club = items?.clubs[id];
              return club ? (
                <ClubCard
                  key={id}
                  club={club}
                  onOpen={() => onOpen({ kind: "club", item: club })}
                />
              ) : null;
            }}
          />
        </>
      );

    case "opportunity_list":
      return (
        <>
          <h2 className="mb-3 text-base">Open opportunities</h2>
          <ItemList
            loading={loading}
            ids={section.opportunity_ids}
            render={(id) => {
              const opportunity = items?.opportunities[id];
              return opportunity ? (
                <OpportunityCard
                  key={id}
                  opportunity={opportunity}
                  onOpen={() => onOpen({ kind: "opportunity", item: opportunity })}
                />
              ) : null;
            }}
          />
        </>
      );

    case "insight":
      return (
        <>
          <h2 className="mb-3 text-base">What this means</h2>
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">{section.markdown}</p>
        </>
      );
  }
}

function ItemList({
  ids,
  loading,
  render,
}: {
  ids: string[];
  loading: boolean;
  render: (id: string) => React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {ids.slice(0, 3).map((id) => (
          <Skeleton key={id} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }
  const rendered = ids.map(render).filter(Boolean);
  if (rendered.length === 0) {
    return <Empty message="Nothing here yet. Ask the chat to widen the search." />;
  }
  return <div className="space-y-2">{rendered}</div>;
}
