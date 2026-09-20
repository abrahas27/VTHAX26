// F7: the full Gap-to-Goal roadmap.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { RoadmapTimeline } from "@/components/dashboard/roadmap-timeline";

export const dynamic = "force-dynamic";

export default async function RoadmapPage({ searchParams }: PageProps<"/roadmap">) {
  const session = await auth();
  if (!session) redirect("/");
  const { goal } = await searchParams;

  return (
    <AppShell isAdmin={session.isAdmin}>
      <RoadmapTimeline goal={typeof goal === "string" ? goal : undefined} />
    </AppShell>
  );
}
