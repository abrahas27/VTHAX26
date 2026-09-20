// F11: Admin Insights (Career Services). src/proxy.ts already restricts /admin to ADMIN_EMAILS.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { AdminView } from "@/components/admin/admin-view";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/");
  if (!session.isAdmin) redirect("/unauthorized");

  return (
    <AppShell isAdmin>
      <AdminView aibiDashboardUrl={env.NEXT_PUBLIC_AIBI_DASHBOARD_URL} />
    </AppShell>
  );
}
