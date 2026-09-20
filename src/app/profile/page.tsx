// Your profile: what HireUp knows about you, and a way to replace the resume it learned it from.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { ProfileView } from "@/components/profile/profile-view";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/");

  // Name, email and picture come from the Google session, not from Lakebase: they are the
  // account's own details, and reading them here saves the client a round trip on load.
  return (
    <AppShell isAdmin={session.isAdmin}>
      <ProfileView
        account={{
          name: session.user?.name ?? null,
          email: session.user?.email ?? null,
          image: session.user?.image ?? null,
          isAdmin: session.isAdmin,
        }}
      />
    </AppShell>
  );
}
