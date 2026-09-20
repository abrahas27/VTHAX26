// F4: the For You dashboard. The shell renders on the server; cards stream in client-side.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const session = await auth();
  if (!session) redirect("/");
  const { tab } = await searchParams;
  const activeTab = typeof tab === "string" ? tab : "for-you";

  return (
    <AppShell isAdmin={session.isAdmin} greeting={`Hey ${firstName(session.user?.name)}`}>
      <p className="text-muted-foreground mb-4 hidden text-sm lg:block">
        Hey {firstName(session.user?.name)}
      </p>
      <DashboardView tab={activeTab} />
    </AppShell>
  );
}

const firstName = (name?: string | null) => (name ?? "there").split(" ")[0];
