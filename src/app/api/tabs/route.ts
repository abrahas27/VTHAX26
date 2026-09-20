// GET/PATCH/DELETE /api/tabs : the AI-created goal tabs (F6). Tabs persist in dashboard_state.
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, parseQuery, requireUser } from "@/lib/api";
import { DashboardSpecSchema } from "@/lib/agent/dashboard-spec";
import { getDashboardLayout, replaceDashboardTabs } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const layout = await getDashboardLayout(auth.user.userId);
  return NextResponse.json({ tabs: layout.tabs });
}

const PatchSchema = z.object({ tabs: z.array(DashboardSpecSchema).max(8) });

/** Used for reordering, renaming and pinning; the agent writes tabs through render_dashboard. */
export async function PATCH(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, PatchSchema);
  if (!body.ok) return body.response;

  const version = await replaceDashboardTabs(auth.user.userId, body.data.tabs);
  return NextResponse.json({ tabs: body.data.tabs, version });
}

const DeleteSchema = z.object({ tab: z.string().regex(/^CP\d{2}$/) });

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const query = parseQuery(req.url, DeleteSchema);
  if (!query.ok) return query.response;

  const layout = await getDashboardLayout(auth.user.userId);
  const tabs = layout.tabs.filter((tab) => tab.tab_id !== query.data.tab);
  const version = await replaceDashboardTabs(auth.user.userId, tabs);
  return NextResponse.json({ tabs, version });
}
