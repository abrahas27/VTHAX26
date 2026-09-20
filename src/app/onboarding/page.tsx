// Placeholder: the real wizard (F2 resume upload, F3 questionnaire) is built in P2.
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Onboarding() {
  const session = await auth();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-3 p-8">
      <h1 className="text-xl">Welcome{session?.user?.name ? `, ${session.user.name}` : ""}</h1>
      <p className="text-muted-foreground text-sm">
        Resume upload and the career questionnaire arrive in phase P2.
      </p>
    </main>
  );
}
