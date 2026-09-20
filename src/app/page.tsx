// F1: landing page (spec Figure 5.1). Public; the only action is Continue with Google.
import Image from "next/image";
import Link from "next/link";
import { CalendarClock, MessageCircleQuestion, Target } from "lucide-react";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SignInButton, SignOutButton } from "@/components/sign-in-button";
import { WarmUp } from "@/components/warm-up";

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
      {/* Google's consent screen takes several seconds; start the warehouse now so the first
          dashboard load does not pay for a cold start (spec 14.3). */}
      <WarmUp />
      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-5">
        <span className="text-base font-semibold tracking-tight">HireUp</span>
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
                Continue to HireUp
              </Button>
            ) : (
              <SignInButton />
            )}
            <p className="text-muted-foreground text-xs">
              Every event, club and recruiter visit comes from Virginia Tech data in Unity Catalog.
              Nothing on your dashboard is invented.
            </p>
          </div>

          {/*
            The hero art. Shipped as a pre-resized WebP (1.4 MB PNG -> 172 KB) rather than the
            original: this is the largest element above the fold, so it is what Largest Contentful
            Paint measures. `priority` preloads it instead of waiting for the lazy-load observer,
            and the explicit dimensions reserve the box so nothing below it shifts when it lands.
          */}
          <div className="card-elevated relative aspect-[3/2] overflow-hidden">
            <Image
              src="/hero-resumes.webp"
              alt="The Virginia Tech HokieBird tossing out resumes to Google, Microsoft, Amazon, Apple, Meta, NVIDIA and Virginia Tech."
              width={1400}
              height={933}
              priority
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="size-full object-cover"
            />
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
