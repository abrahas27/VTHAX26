"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { GenieBox } from "./genie-box";
import { KpiCards, type AdminKpis } from "./kpi-cards";
import { SkillGapTable, type SkillGapRow } from "./skill-gap-table";
import { SupplyDemandChart, type SupplyDemandRow } from "./supply-demand-chart";
import { Skeleton } from "@/components/ui/skeleton";

interface MetricsResponse {
  kpis: AdminKpis;
  supplyDemand: SupplyDemandRow[];
  topGaps: SkillGapRow[];
}

async function fetchMetrics(): Promise<MetricsResponse> {
  const res = await fetch("/api/admin/metrics");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? "Could not load admin metrics.");
  }
  return (await res.json()) as MetricsResponse;
}

/** Admin Insights (spec F11): KPI cards, supply/demand chart, skill-gap table, Ask the data. */
export function AdminView({ aibiDashboardUrl }: { aibiDashboardUrl?: string }) {
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: fetchMetrics,
  });

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

      {error && <p className="text-danger text-sm">{error.message}</p>}

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
