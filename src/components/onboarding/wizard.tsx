"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Loader2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BUILD_STEPS, ENERGIZERS, FLAGS, HOURS, INDUSTRIES, LOCATIONS, SEEKING } from "./questions";
import {
  SKILL_LEVEL_LABELS,
  type CareerPath,
  type ProfileSkill,
  type SkillLevel,
} from "@/lib/types";

type Step = "resume" | "review" | "questions" | "build";

interface ResumeResult {
  profileDraft: {
    displayName: string;
    majorCode: string | null;
    classYear: string | null;
    skills: ProfileSkill[];
    clubs: string[];
    experiences: { title: string; org: string }[];
    projects: { name: string }[];
  };
  unmatchedSkills: string[];
  fileName: string;
}

const STEP_LABELS: Record<Step, string> = {
  resume: "Resume",
  review: "Review",
  questions: "Questions",
  build: "Build",
};

export function OnboardingWizard({ paths }: { paths: CareerPath[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("resume");
  const [result, setResult] = useState<ResumeResult | null>(null);
  const [skills, setSkills] = useState<ProfileSkill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [seeking, setSeeking] = useState<string[]>([]);
  const [interestedPaths, setInterestedPaths] = useState<string[]>([]);
  const [energizers, setEnergizers] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [hoursPerWeek, setHoursPerWeek] = useState("3-5");
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  const upload = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/resume", { method: "POST", body: form });
      const body = (await res.json()) as ResumeResult & { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Could not read that file.");
      setResult(body);
      setSkills(body.profileDraft.skills);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStep("build");
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills }),
      });
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: {
            seeking,
            interestedPaths,
            energizers,
            industries,
            locations,
            hoursPerWeek,
            flags,
          },
          selfRatings: {},
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message: string } };
        throw new Error(body.error?.message ?? "Could not build your profile.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("questions");
    } finally {
      setBusy(false);
    }
  }, [energizers, flags, hoursPerWeek, industries, interestedPaths, locations, seeking, skills]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Stepper current={step} />

      {error && (
        <p className="border-danger/40 text-danger mt-6 rounded-xl border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {step === "resume" && <ResumeStep busy={busy} onFile={upload} />}

      {step === "review" && result && (
        <ReviewStep
          result={result}
          skills={skills}
          setSkills={setSkills}
          onContinue={() => setStep("questions")}
        />
      )}

      {step === "questions" && (
        <QuestionsStep
          paths={paths}
          state={{
            seeking,
            interestedPaths,
            energizers,
            industries,
            locations,
            hoursPerWeek,
            flags,
          }}
          set={{
            setSeeking,
            setInterestedPaths,
            setEnergizers,
            setIndustries,
            setLocations,
            setHoursPerWeek,
            setFlags,
          }}
          busy={busy}
          onSubmit={submit}
        />
      )}

      {step === "build" && <BuildStep onDone={() => router.push("/dashboard?welcome=1")} />}
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const order: Step[] = ["resume", "review", "questions", "build"];
  const index = order.indexOf(current);
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Onboarding progress">
      {order.map((step, i) => (
        <li key={step} className="flex flex-1 items-center gap-2">
          <span
            className={
              i <= index
                ? "bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full"
                : "bg-surface-2 text-muted-foreground flex size-6 items-center justify-center rounded-full"
            }
            aria-current={i === index ? "step" : undefined}
          >
            {i < index ? <Check className="size-3" aria-hidden="true" /> : i + 1}
          </span>
          <span className={i === index ? "text-foreground" : "text-muted-foreground"}>
            {STEP_LABELS[step]}
          </span>
          {i < order.length - 1 && <span className="bg-border h-px flex-1" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

function ResumeStep({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <section className="mt-8">
      <h1 className="text-xl">Upload your resume</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        PDF or DOCX, up to 5 MB. We read the text, then discard the file.
      </p>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={`mt-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-12 text-center transition-colors ${
          dragging ? "border-accent bg-surface-2" : "border-border hover:bg-surface-2"
        }`}
      >
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
        {busy ? (
          <>
            <Loader2 className="text-accent size-6 animate-spin" aria-hidden="true" />
            <span className="text-sm">Reading your resume...</span>
          </>
        ) : (
          <>
            <Upload className="text-accent size-6" strokeWidth={1.75} aria-hidden="true" />
            <span className="text-sm font-medium">Drop your resume here, or click to choose</span>
            <span className="text-muted-foreground text-xs">
              No resume handy? You can add skills by hand after this step.
            </span>
          </>
        )}
      </label>
    </section>
  );
}

function ReviewStep({
  result,
  skills,
  setSkills,
  onContinue,
}: {
  result: ResumeResult;
  skills: ProfileSkill[];
  setSkills: (skills: ProfileSkill[]) => void;
  onContinue: () => void;
}) {
  const { profileDraft, unmatchedSkills } = result;
  return (
    <section className="mt-8">
      <h1 className="text-xl">Here&apos;s what we found. Edit anything.</h1>
      <div className="card-elevated mt-6 space-y-2 p-5 text-sm">
        <p>
          <span className="text-muted-foreground">Major:</span>{" "}
          {profileDraft.majorCode ?? "Not found"}
        </p>
        <p>
          <span className="text-muted-foreground">Class year:</span>{" "}
          {profileDraft.classYear ?? "Not found"}
        </p>
        <p>
          <span className="text-muted-foreground">Experience:</span>{" "}
          {profileDraft.experiences.length} items · {profileDraft.projects.length} projects
        </p>
      </div>

      <h2 className="mt-6 text-base">Skills</h2>
      <p className="text-muted-foreground mt-1 text-xs">
        Hover a chip to see the resume sentence it came from. Adjust the level if we guessed wrong.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {skills.map((skill) => (
          <SkillChip
            key={skill.name}
            skill={skill}
            onLevel={(level) =>
              setSkills(skills.map((s) => (s.name === skill.name ? { ...s, level } : s)))
            }
            onRemove={() => setSkills(skills.filter((s) => s.name !== skill.name))}
          />
        ))}
        {skills.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No skills detected. You can add them later.
          </p>
        )}
      </div>

      {unmatchedSkills.length > 0 && (
        <p className="text-muted-foreground mt-3 text-xs">
          Kept as custom skills: {unmatchedSkills.join(", ")}
        </p>
      )}

      <div className="mt-8 flex justify-end">
        <Button onClick={onContinue}>Continue</Button>
      </div>
    </section>
  );
}

function SkillChip({
  skill,
  onLevel,
  onRemove,
}: {
  skill: ProfileSkill;
  onLevel: (level: SkillLevel) => void;
  onRemove: () => void;
}) {
  return (
    <span
      className="border-border bg-surface-2 flex items-center gap-2 rounded-full border py-1 pr-1 pl-3 text-xs"
      title={skill.evidence ?? undefined}
    >
      {skill.name}
      <select
        aria-label={`${skill.name} proficiency`}
        value={skill.level}
        onChange={(e) => onLevel(Number(e.target.value) as SkillLevel)}
        className="bg-surface text-muted-foreground rounded-full px-2 py-0.5 text-[11px]"
      >
        {([1, 2, 3, 4] as SkillLevel[]).map((level) => (
          <option key={level} value={level}>
            {SKILL_LEVEL_LABELS[level]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${skill.name}`}
        className="text-muted-foreground hover:text-foreground px-1"
      >
        ×
      </button>
    </span>
  );
}

interface QuestionState {
  seeking: string[];
  interestedPaths: string[];
  energizers: string[];
  industries: string[];
  locations: string[];
  hoursPerWeek: string;
  flags: Record<string, boolean>;
}

function QuestionsStep({
  paths,
  state,
  set,
  busy,
  onSubmit,
}: {
  paths: CareerPath[];
  state: QuestionState;
  set: {
    setSeeking: (v: string[]) => void;
    setInterestedPaths: (v: string[]) => void;
    setEnergizers: (v: string[]) => void;
    setIndustries: (v: string[]) => void;
    setLocations: (v: string[]) => void;
    setHoursPerWeek: (v: string) => void;
    setFlags: (v: Record<string, boolean>) => void;
  };
  busy: boolean;
  onSubmit: () => void;
}) {
  const toggle = (list: string[], value: string, limit = Number.POSITIVE_INFINITY) =>
    list.includes(value)
      ? list.filter((v) => v !== value)
      : list.length >= limit
        ? list
        : [...list, value];

  return (
    <section className="mt-8 space-y-8">
      <h1 className="text-xl">A few questions about what you want</h1>

      <Question label="What are you hoping to land next?">
        <ChipGroup
          options={SEEKING}
          selected={state.seeking}
          onToggle={(v) => set.setSeeking(toggle(state.seeking, v))}
        />
      </Question>

      <Question label="Which paths interest you?" hint="Pick any that apply.">
        <ChipGroup
          options={paths.map((p) => ({ value: p.path_id, label: p.path_name }))}
          selected={state.interestedPaths}
          onToggle={(v) => set.setInterestedPaths(toggle(state.interestedPaths, v))}
        />
      </Question>

      <Question label="What energizes you most?" hint="Pick up to 2.">
        <ChipGroup
          options={ENERGIZERS}
          selected={state.energizers}
          onToggle={(v) => set.setEnergizers(toggle(state.energizers, v, 2))}
        />
      </Question>

      <Question label="Preferred industries?">
        <ChipGroup
          options={INDUSTRIES}
          selected={state.industries}
          onToggle={(v) => set.setIndustries(toggle(state.industries, v))}
        />
      </Question>

      <Question label="Where do you want to work?">
        <ChipGroup
          options={LOCATIONS}
          selected={state.locations}
          onToggle={(v) => set.setLocations(toggle(state.locations, v))}
        />
      </Question>

      <Question label="How many hours a week can you invest in career prep?">
        <ChipGroup
          options={HOURS}
          selected={[state.hoursPerWeek]}
          onToggle={(v) => set.setHoursPerWeek(v)}
        />
      </Question>

      <Question label="Anything we should know?" hint="Optional and private.">
        <div className="space-y-2">
          {FLAGS.map((flag) => (
            <label key={flag.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={state.flags[flag.value] ?? false}
                onCheckedChange={(checked) =>
                  set.setFlags({ ...state.flags, [flag.value]: checked === true })
                }
              />
              {flag.label}
            </label>
          ))}
        </div>
      </Question>

      <div className="flex justify-end">
        <Button onClick={onSubmit} disabled={busy}>
          {busy ? "Building..." : "Build my dashboard"}
        </Button>
      </div>
    </section>
  );
}

function Question({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(option.value)}
            className={`min-h-[36px] rounded-full border px-3 py-1.5 text-xs transition-colors ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-surface-2"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Build sequence: ticks through the real work while the profile is computed (spec 5.7). */
function BuildStep({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (done >= BUILD_STEPS.length) {
      const timer = setTimeout(onDone, 400);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setDone((d) => d + 1), reduceMotion ? 150 : 550);
    return () => clearTimeout(timer);
  }, [done, onDone, reduceMotion]);

  return (
    <section className="mt-16 flex flex-col items-center gap-6">
      <h1 className="text-xl">Building your dashboard</h1>
      <ol className="space-y-3">
        {BUILD_STEPS.map((label, i) => (
          <motion.li
            key={label}
            initial={{ opacity: reduceMotion ? 1 : 0.35 }}
            animate={{ opacity: i < done ? 1 : 0.35 }}
            className="flex items-center gap-3 text-sm"
          >
            {i < done ? (
              <Check className="text-success size-4" aria-hidden="true" />
            ) : (
              <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />
            )}
            {label}
          </motion.li>
        ))}
      </ol>
      <Badge variant="outline" className="text-xs">
        Grounded in Unity Catalog data
      </Badge>
    </section>
  );
}
