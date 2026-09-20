// Post sign-in router (F1): new users go to onboarding, returning users to the dashboard.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { lakebaseConfigured } from "@/lib/db/lakebase";
import { hasCompletedOnboarding } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function Start() {
  const session = await auth();
  if (!session) redirect("/");

  // Until Lakebase exists (spec 11.8) nobody has a stored profile, so onboarding is the safe default.
  if (!session.userId || !lakebaseConfigured()) redirect("/onboarding");

  let onboarded = false;
  try {
    onboarded = await hasCompletedOnboarding(session.userId);
  } catch (err) {
    console.error("[start] onboarding lookup failed", err);
  }
  redirect(onboarded ? "/dashboard" : "/onboarding");
}
