// DELETE /api/me : delete my data (spec 14.2). Cascades from app_users.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { deleteUser } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function DELETE() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  await deleteUser(auth.user.userId);
  return NextResponse.json({ deleted: true });
}
