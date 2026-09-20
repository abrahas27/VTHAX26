// src/components/admin/kpi-cards.tsx : 4 KPI cards from gold_path_supply_demand (spec F11).
import { AlertTriangle, TrendingUp, Users, UserRoundSearch } from "lucide-react";

export interface AdminKpis {
  studentsWithGoal: number;
  pctPivoting: number;
  mostUnderservedPath: {
    pathId: string;
    pathName: string;
    studentsPerUpcomingEvent: number;
  } | null;
  attendanceLiftPct: number | null;
}

export function KpiCards({ kpis }: { kpis: AdminKpis }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        icon={Users}
        label="Students with a goal"
        value={kpis.studentsWithGoal.toLocaleString()}
      />
      <Kpi icon={UserRoundSearch} label="Pivoting into a new path" value={`${kpis.pctPivoting}%`} />
      <Kpi
        icon={AlertTriangle}
        label="Most underserved path"
        value={kpis.mostUnderservedPath?.pathName ?? "—"}
        detail={
          kpis.mostUnderservedPath
            ? `${kpis.mostUnderservedPath.studentsPerUpcomingEvent} students / upcoming event`
            : undefined
        }
      />
      <Kpi
        icon={TrendingUp}
        label="Agent-recommended attendance lift"
        value={
          kpis.attendanceLiftPct !== null
            ? `${kpis.attendanceLiftPct > 0 ? "+" : ""}${kpis.attendanceLiftPct}pp`
            : "—"
        }
        detail="vs. self-found registrations"
      />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="card-elevated p-5">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Icon className="size-3.5" aria-hidden="true" strokeWidth={1.75} />
        {label}
      </div>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight">{value}</p>
      {detail && <p className="text-muted-foreground mt-1 text-xs">{detail}</p>}
    </div>
  );
}
