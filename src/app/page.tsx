// F1: landing page (spec Figure 5.1). Public; the only action is Continue with Google.
import Link from "next/link";
import { CalendarClock, MessageCircleQuestion, Target } from "lucide-react";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SignInButton, SignOutButton } from "@/components/sign-in-button";

const FEATURES = [
  {
    icon: Target,
    title: "Know your gaps",
    body: "We read your resume and score you against 19 VT career paths.",
  },
  {
    icon: CalendarClock,
    title: "Never miss a recruiter",
    body: "See which companies come to campus, and when, before the deadlines pass.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Ask anything",
    body: "Ask about a pivot and the dashboard rebuilds itself around that goal.",
  },
];

export default async function Landing() {
  const session = await auth();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-5">
        <span className="text-base font-semibold tracking-tight">HokiePath</span>
        {session ? (
          <div className="flex items-center gap-2">
            <Button size="sm" nativeButton={false} render={<Link href="/start" />}>
              Open dashboard
            </Button>
            <SignOutButton />
          </div>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 pb-16">
        <section className="grid items-center gap-10 py-10 lg:grid-cols-2 lg:py-16">
          <div className="flex flex-col gap-6">
            <h1 className="text-3xl leading-[1.05] sm:text-[3rem]">
              Your career, mapped
              <br />
              to Virginia Tech.
            </h1>
            <p className="text-muted-foreground max-w-md text-base">
              Upload your resume. Ask anything. Get a living plan of events, clubs, and recruiters.
            </p>
            {session ? (
              <Button
                size="lg"
                className="w-full sm:w-auto"
                nativeButton={false}
                render={<Link href="/start" />}
              >
                Continue to HokiePath
              </Button>
            ) : (
              <SignInButton />
            )}
          </div>

          <div
            className="card-elevated flex aspect-[16/10] items-center justify-center"
            aria-hidden="true"
          >
            {/* Product preview (screenshot or pivot clip) lands here before the demo. */}
            <span className="text-muted-foreground text-sm">product preview</span>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card-elevated flex flex-col gap-2 p-5">
              <Icon className="text-accent size-5" strokeWidth={1.75} aria-hidden="true" />
              <h2 className="text-base">{title}</h2>
              <p className="text-muted-foreground text-sm">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-border mx-auto w-full max-w-[1440px] border-t px-6 py-6">
        <p className="text-muted-foreground text-xs">
          Built on Databricks for the Deloitte x Databricks VTHacks challenge.
        </p>
      </footer>
    </div>
  );
}
