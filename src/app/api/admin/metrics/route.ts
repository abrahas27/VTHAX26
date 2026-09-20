// GET /api/admin/metrics : Admin Insights KPI cards, chart, and gap table (spec F11).
// Reads only the gold_* aggregate tables and synthetic `students`/`event_registrations` rows, so no
// individual student is ever identifiable in the response (spec 14.2).
import { NextResponse } from "next/server";
import { apiError, requireUser } from "@/lib/api";
import { sql, T } from "@/lib/databricks/sql";
import { withTiming } from "@/lib/timing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StudentCounts {
  total_students: number;
  pivoting_students: number;
}
interface SupplyDemandRow {
  path_id: string;
  path_name: string;
  career_family: string;
  students_targeting: number;
  students_pivoting_in: number;
  upcoming_events: number;
  recruiting_companies: number;
  open_opportunities: number;
  avg_fill_rate: number | null;
  avg_attendance_rate: number | null;
  students_per_upcoming_event: number;
}
interface AttendanceRow {
  recommended_by_agent: boolean;
  n: number;
  attended: number;
  closed: number;
}
interface GapRow {
  path_name: string;
  missing_skill: string;
  students_missing: number;
  students_targeting_path: number;
  pct_missing: number;
  importance: number;
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!auth.user.isAdmin) return apiError("forbidden", "Admin access required.");

  const { result, serverTiming } = await withTiming("/api/admin/metrics", handle, {
    userId: auth.user.userId,
  });
  result.headers.set("Server-Timing", serverTiming);
  return result;
}

async function handle() {
  try {
    const [studentCounts, supplyDemand, attendance, gaps] = await Promise.all([
      sql<StudentCounts>(
        `SELECT count(*) AS total_students, count_if(is_pivoting) AS pivoting_students
           FROM ${T("students")} WHERE target_path_id IS NOT NULL`,
      ),
      sql<SupplyDemandRow>(
        `SELECT path_id, path_name, career_family, students_targeting, students_pivoting_in,
                upcoming_events, recruiting_companies, open_opportunities, avg_fill_rate,
                avg_attendance_rate, students_per_upcoming_event
           FROM ${T("gold_path_supply_demand")}
          ORDER BY students_targeting DESC`,
      ),
      sql<AttendanceRow>(
        `SELECT recommended_by_agent,
                count(*) AS n,
                count_if(status = 'attended') AS attended,
                count_if(status IN ('attended', 'no_show')) AS closed
           FROM ${T("event_registrations")} GROUP BY recommended_by_agent`,
      ),
      sql<GapRow>(
        `SELECT path_name, missing_skill, students_missing, students_targeting_path, pct_missing, importance
           FROM ${T("gold_skill_gap_summary")}
          ORDER BY pct_missing DESC, importance DESC LIMIT 10`,
      ),
    ]);

    const counts = studentCounts[0] ?? { total_students: 0, pivoting_students: 0 };
    const mostUnderserved = [...supplyDemand]
      .filter((p) => p.students_targeting > 0)
      .sort((a, b) => b.students_per_upcoming_event - a.students_per_upcoming_event)[0];

    const rate = (row: AttendanceRow | undefined) =>
      row && row.closed > 0 ? row.attended / row.closed : null;
    const recommended = rate(attendance.find((a) => a.recommended_by_agent));
    const selfFound = rate(attendance.find((a) => !a.recommended_by_agent));
    const attendanceLiftPct =
      recommended !== null && selfFound !== null
        ? Math.round((recommended - selfFound) * 1000) / 10
        : null;

    return NextResponse.json({
      kpis: {
        studentsWithGoal: counts.total_students,
        pctPivoting:
          counts.total_students > 0
            ? Math.round((counts.pivoting_students / counts.total_students) * 1000) / 10
            : 0,
        mostUnderservedPath: mostUnderserved
          ? {
              pathId: mostUnderserved.path_id,
              pathName: mostUnderserved.path_name,
              studentsPerUpcomingEvent: mostUnderserved.students_per_upcoming_event,
            }
          : null,
        attendanceLiftPct,
      },
      supplyDemand: supplyDemand.map((r) => ({
        pathId: r.path_id,
        pathName: r.path_name,
        careerFamily: r.career_family,
        studentsTargeting: r.students_targeting,
        studentsPivotingIn: r.students_pivoting_in,
        upcomingEvents: r.upcoming_events,
        recruitingCompanies: r.recruiting_companies,
        openOpportunities: r.open_opportunities,
        studentsPerUpcomingEvent: r.students_per_upcoming_event,
      })),
      topGaps: gaps.map((g) => ({
        pathName: g.path_name,
        missingSkill: g.missing_skill,
        studentsMissing: g.students_missing,
        studentsTargetingPath: g.students_targeting_path,
        pctMissing: Math.round(g.pct_missing * 1000) / 10,
        importance: g.importance,
      })),
    });
  } catch (err) {
    console.error("[admin/metrics] failed", err);
    return apiError("upstream_error", "Could not load admin metrics right now.");
  }
}
