// src/components/admin/skill-gap-table.tsx : top missing skills from gold_skill_gap_summary (F11).
import { Badge } from "@/components/ui/badge";

export interface SkillGapRow {
  pathName: string;
  missingSkill: string;
  studentsMissing: number;
  studentsTargetingPath: number;
  pctMissing: number;
}

export function SkillGapTable({ rows }: { rows: SkillGapRow[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No skill-gap data yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="pr-3 pb-2 font-normal">Path</th>
            <th className="pr-3 pb-2 font-normal">Missing skill</th>
            <th className="pb-2 font-normal">% missing it</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.pathName}-${row.missingSkill}`} className="border-border border-t">
              <td className="py-2 pr-3">{row.pathName}</td>
              <td className="py-2 pr-3">{row.missingSkill}</td>
              <td className="py-2">
                <Badge variant="outline" className="text-xs">
                  {row.pctMissing}% ({row.studentsMissing}/{row.studentsTargetingPath})
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
