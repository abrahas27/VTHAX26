// F2 + F3: resume upload, review, questionnaire, build sequence.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { careerPaths } from "@/lib/catalog";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import type { CareerPath } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Onboarding() {
  const session = await auth();
  if (!session) redirect("/");

  // The path list drives Q2; if the catalog is unreachable the wizard still runs without it.
  let paths: CareerPath[] = [];
  try {
    paths = await careerPaths();
  } catch (err) {
    console.error("[onboarding] could not load career paths", err);
  }

  return <OnboardingWizard paths={paths} />;
}
