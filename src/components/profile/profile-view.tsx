"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CardListSkeleton,
  Empty,
  Section,
  Stagger,
  WakingNotice,
} from "@/components/dashboard/states";
import { apiFetch } from "@/lib/client/api";
import { useWaking } from "@/lib/client/waking";
import { SKILL_LEVEL_LABELS, type SkillProfile } from "@/lib/types";

export interface Account {
  name: string | null;
  email: string | null;
  image: string | null;
  isAdmin: boolean;
}

const READING_STAGES = [
  "Reading your resume...",
  "Pulling out your experience...",
  "Matching your skills to the VT catalog...",
  "Rebuilding your dashboard...",
];

/**
 * The profile page (F2's review screen, made permanent). Shows what the app knows about the
 * student and lets them replace the resume behind it: a new upload re-parses their skills, which
 * is what readiness, the gap list and every ranked card are computed from, so the dashboard moves
 * with it.
 */
export function ProfileView({ account }: { account: Account }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState(0);

  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiFetch<SkillProfile>("/api/profile"),
  });

  const waking = useWaking(profile.isPending);

  useEffect(() => {
    if (!uploading) return;
    const timer = setInterval(
      () => setStage((s) => Math.min(s + 1, READING_STAGES.length - 1)),
      2_500,
    );
    return () => clearInterval(timer);
  }, [uploading]);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setStage(0);
      try {
        await apiFetch("/api/resume", {
          method: "POST",
          body: (() => {
            const form = new FormData();
            form.append("file", file);
            return form;
          })(),
        });

        // /api/resume clears this user's server-side dashboard cache; clearing the client's
        // copies too is what makes the dashboard reflect the new resume rather than a minute-old
        // render of the old one.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["profile"] }),
          queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
          queryClient.invalidateQueries({ queryKey: ["roadmap"] }),
        ]);
        // The dashboard is a server component shell; refresh it so a Back navigation cannot show
        // a cached render from before the upload.
        router.refresh();

        toast.success("Resume updated", {
          description: "Your skills, readiness and recommendations have been rebuilt.",
          action: { label: "See dashboard", onClick: () => router.push("/dashboard") },
        });
      } catch (err) {
        toast.error("Could not read that resume", {
          description: err instanceof Error ? err.message : "Try a text-based PDF or a DOCX.",
        });
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [queryClient, router],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl">Your profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          What HireUp knows about you, and where it learned it.
        </p>
      </header>

      {waking && <WakingNotice />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Stagger index={0}>
          <Section title="Account" className="h-full">
            <div className="flex items-start gap-4">
              {account.image ? (
                // A 48px avatar from Google's CDN is not the LCP element and never will be;
                // routing it through next/image would mean configuring a remote pattern and
                // paying the optimizer per account, to save nothing.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={account.image}
                  alt=""
                  width={48}
                  height={48}
                  className="border-border size-12 shrink-0 rounded-full border"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="bg-surface-2 text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-full text-base">
                  {(account.name ?? account.email ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium">{account.name ?? "Signed in"}</p>
                <p className="text-muted-foreground truncate text-xs">{account.email}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="outline" className="text-[10px]">
                    Google account
                  </Badge>
                  {account.isAdmin && (
                    <Badge className="bg-accent text-accent-foreground text-[10px]">
                      <ShieldCheck className="size-3" aria-hidden="true" />
                      Career Services
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <dl className="border-border mt-5 grid grid-cols-2 gap-4 border-t pt-5 text-sm">
              <Field label="Major" value={profile.data?.majorCode} loading={profile.isPending} />
              <Field
                label="Class year"
                value={profile.data?.classYear}
                loading={profile.isPending}
              />
              <Field
                label="Primary goal"
                value={profile.data?.primaryGoalName ?? profile.data?.primaryGoal}
                loading={profile.isPending}
              />
              <Field
                label="Skills on file"
                value={profile.data ? String(profile.data.skills.length) : null}
                loading={profile.isPending}
              />
            </dl>
          </Section>
        </Stagger>

        <Stagger index={1}>
          <Section
            title="Resume"
            subtitle="PDF or DOCX, up to 5 MB"
            className="flex h-full flex-col"
          >
            <p className="text-muted-foreground text-sm">
              Uploading a new resume re-reads your skills and rebuilds your readiness score, gap
              list and recommendations. We read the text and discard the file.
            </p>

            <label
              className={`mt-4 flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-8 text-center transition-colors ${
                uploading ? "border-accent" : "border-border hover:bg-surface-2"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              {uploading ? (
                <>
                  <Loader2 className="text-accent size-5 animate-spin" aria-hidden="true" />
                  <span className="text-sm" role="status">
                    {READING_STAGES[stage]}
                  </span>
                </>
              ) : (
                <>
                  <FileUp className="text-accent size-5" strokeWidth={1.75} aria-hidden="true" />
                  <span className="text-sm font-medium">Replace your resume</span>
                  <span className="text-muted-foreground text-xs">
                    Drop a file here, or click to choose
                  </span>
                </>
              )}
            </label>
          </Section>
        </Stagger>
      </div>

      <Stagger index={2}>
        <Section
          title="Skills we found"
          subtitle={
            profile.data && profile.data.skills.length > 0
              ? `${profile.data.skills.length} on file`
              : undefined
          }
        >
          {profile.isPending ? (
            <CardListSkeleton count={2} />
          ) : profile.error ? (
            <Empty
              message={profile.error.message}
              actionLabel="Try again"
              onAction={() => void profile.refetch()}
            />
          ) : profile.data.skills.length === 0 ? (
            <Empty message="No skills on file yet. Upload a resume above and they will appear here." />
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {[...profile.data.skills]
                .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
                .map((skill) => (
                  <li
                    key={skill.name}
                    className="bg-surface-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                    title={skill.evidence ?? undefined}
                  >
                    {skill.name}
                    <span className="text-muted-foreground text-[10px]">
                      {SKILL_LEVEL_LABELS[skill.level]}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Section>
      </Stagger>

      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<a href="/dashboard" />}>
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  loading,
}: {
  label: string;
  value?: string | null;
  loading: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {loading ? <Skeleton className="h-4 w-24" /> : (value ?? "Not set")}
      </dd>
    </div>
  );
}
