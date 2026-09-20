"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { ExternalLink } from "lucide-react";
import { KpiCards, type AdminKpis } from "./kpi-cards";
import { SkillGapTable, type SkillGapRow } from "./skill-gap-table";
import { type SupplyDemandRow } from "./supply-demand-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/client/api";
import { useWaking } from "@/lib/client/waking";
import { Empty, WakingNotice } from "@/components/dashboard/states";

// Recharts is the largest dependency in the app and only Career Services ever sees it; keeping
// it out of the shared bundle costs nothing here and helps every student page (spec 6.4).
const SupplyDemandChart = dynamic(
  () => import("./supply-demand-chart").then((m) => m.SupplyDemandChart),
  { ssr: false, loading: () => <Skeleton className="h-72 rounded-xl" /> },
);
const GenieBox = dynamic(() => import("./genie-box").then((m) => m.GenieBox), {
  ssr: false,
  loading: () => <Skeleton className="h-24 rounded-xl" />,
});

interface MetricsResponse {
  kpis: AdminKpis;
  supplyDemand: SupplyDemandRow[];
  topGaps: SkillGapRow[];
}

const fetchMetrics = () => apiFetch<MetricsResponse>("/api/admin/metrics");

/** Admin Insights (spec F11): KPI cards, supply/demand chart, skill-gap table, Ask the data. */
export function AdminView({ aibiDashboardUrl }: { aibiDashboardUrl?: string }) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: fetchMetrics,
  });
  const waking = useWaking(isPending);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl">Admin Insights</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Aggregate demand and supply across all career paths. No individual student is shown.
          </p>
        </div>
        {aibiDashboardUrl && (
          <a
            href={aibiDashboardUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent hover:text-foreground flex items-center gap-1.5 text-sm"
          >
            Open the AI/BI dashboard
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </header>

      {waking && <WakingNotice />}

      {isPending && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      )}

      {error && (
        <div className="card-elevated p-5">
          <Empty message={error.message} actionLabel="Try again" onAction={() => void refetch()} />
        </div>
      )}

      {data && (
        <>
          <KpiCards kpis={data.kpis} />

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card-elevated p-5">
              <h2 className="mb-3 text-base">Students per upcoming event by path</h2>
              <SupplyDemandChart rows={data.supplyDemand} />
            </section>

            <section className="card-elevated p-5">
              <h2 className="mb-3 text-base">Top missing skills</h2>
              <SkillGapTable rows={data.topGaps} />
            </section>
          </div>

          <section className="card-elevated p-5">
            <h2 className="mb-3 text-base">Ask the data</h2>
            <GenieBox />
          </section>
        </>
      )}
    </div>
  );
}
