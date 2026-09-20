// src/components/admin/supply-demand-chart.tsx : "Students per upcoming event by path" (spec F11).
"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SupplyDemandRow {
  pathId: string;
  pathName: string;
  studentsTargeting: number;
  upcomingEvents: number;
  studentsPerUpcomingEvent: number;
}

export function SupplyDemandChart({ rows }: { rows: SupplyDemandRow[] }) {
  const data = rows
    .filter((r) => r.studentsTargeting > 0)
    .sort((a, b) => b.studentsPerUpcomingEvent - a.studentsPerUpcomingEvent)
    .slice(0, 10);

  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">No demand data yet.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 24, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="pathName"
            width={140}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={(value, _name, item) => {
              const row = item.payload as SupplyDemandRow;
              return [
                `${value} students / event (${row.studentsTargeting} targeting, ${row.upcomingEvents} events)`,
                "",
              ];
            }}
          />
          <Bar
            dataKey="studentsPerUpcomingEvent"
            fill="var(--hp-accent)"
            radius={[0, 6, 6, 0]}
            maxBarSize={18}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
