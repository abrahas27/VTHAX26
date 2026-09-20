// DELETE /api/me : delete my data (spec 14.2). Cascades from app_users.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { deleteUser } from "@/lib/db/queries";

export const runtime = "nodejs";
// Lakebase and the Databricks workspace both live in AWS us-east-2; iad1 is the closest Vercel
// region, so the round trips this route makes are as short as they can be (spec 6.4).
export const preferredRegion = ["iad1"];

export async function DELETE() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  await deleteUser(auth.user.userId);
  return NextResponse.json({ deleted: true });
}
