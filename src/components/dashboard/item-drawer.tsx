"use client";

import { useState } from "react";
import { CalendarPlus, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { eventTypeLabel, formatDate, formatEventTime, opportunityTypeLabel } from "@/lib/format";
import type { ClubItem, EventItem, OpportunityItem, VisitItem } from "@/lib/types";

export type DrawerItem =
  | { kind: "event"; item: EventItem }
  | { kind: "visit"; item: VisitItem }
  | { kind: "club"; item: ClubItem }
  | { kind: "opportunity"; item: OpportunityItem };

/**
 * Detail drawer for any dashboard card (spec F4). Everything shown here comes from the
 * hydrated catalog row, never from generated text.
 */
export function ItemDrawer({
  selected,
  onClose,
}: {
  selected: DrawerItem | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={selected !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {selected && <DrawerBody selected={selected} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ selected }: { selected: DrawerItem }) {
  if (selected.kind === "event") {
    const event = selected.item;
    return (
      <>
        <SheetHeader>
          <SheetTitle className="pr-6 text-base">{event.title}</SheetTitle>
          <SheetDescription>
            {formatEventTime(event.start)} · {event.location}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6 text-sm">
          <Row label="Type" value={eventTypeLabel(event.type)} />
          <Row label="Host" value={event.companyName ?? event.host} />
          {event.pathNames.length > 0 && <Row label="Paths" value={event.pathNames.join(", ")} />}
          {event.skills.length > 0 && <ChipRow label="Skills covered" values={event.skills} />}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              nativeButton={false}
              render={<a href={`/api/calendar?ids=${event.id}`} download />}
            >
              <CalendarPlus className="size-3.5" aria-hidden="true" />
              Add to calendar
            </Button>
          </div>
          {isPreppable(event.type) && <EventPrep eventId={event.id} />}
          <p className="text-muted-foreground font-mono text-xs">{event.id}</p>
        </div>
      </>
    );
  }

  if (selected.kind === "visit") {
    const visit = selected.item;
    return (
      <>
        <SheetHeader>
          <SheetTitle className="pr-6 text-base">{visit.companyName}</SheetTitle>
          <SheetDescription>
            {formatDate(visit.visitDate)} · {eventTypeLabel(visit.visitType)}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6 text-sm">
          {visit.industry && <Row label="Industry" value={visit.industry} />}
          {visit.rolesRecruiting.length > 0 && (
            <ChipRow label="Recruiting for" values={visit.rolesRecruiting} />
          )}
          <div className="flex flex-wrap gap-1.5">
            {visit.alumniAttending && <Badge variant="outline">VT alumni attending</Badge>}
            {visit.onCampusInterviews && <Badge variant="outline">On-campus interviews</Badge>}
          </div>
        </div>
      </>
    );
  }

  if (selected.kind === "club") {
    const club = selected.item;
    return (
      <>
        <SheetHeader>
          <SheetTitle className="pr-6 text-base">{club.name}</SheetTitle>
          <SheetDescription>
            {club.meetingDay
              ? `${club.meetingDay} ${club.meetingTime ?? ""}`.trim()
              : club.category}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6 text-sm">
          {club.description && <p className="text-muted-foreground">{club.description}</p>}
          {club.skills.length > 0 && <ChipRow label="Skills developed" values={club.skills} />}
          {club.applicationRequired && <Badge variant="outline">Application required</Badge>}
          {club.url && (
            <Button
              variant="secondary"
              size="sm"
              nativeButton={false}
              render={<a href={club.url} target="_blank" rel="noreferrer noopener" />}
            >
              Open on GobblerConnect
            </Button>
          )}
        </div>
      </>
    );
  }

  const opportunity = selected.item;
  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-6 text-base">{opportunity.title}</SheetTitle>
        <SheetDescription>
          {opportunity.companyName}
          {opportunity.location ? ` · ${opportunity.location}` : ""}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6 text-sm">
        <Row label="Type" value={opportunityTypeLabel(opportunity.type)} />
        {opportunity.deadline && (
          <Row
            label="Deadline"
            value={
              formatDate(opportunity.deadline) +
              (opportunity.deadlineEstimated ? " (estimated)" : "")
            }
          />
        )}
        {opportunity.classYears.length > 0 && (
          <Row label="Class years" value={opportunity.classYears.join(", ")} />
        )}
        {opportunity.requiredSkills.length > 0 && (
          <ChipRow label="Required skills" values={opportunity.requiredSkills} />
        )}
        {opportunity.applyUrl && (
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            render={<a href={opportunity.applyUrl} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Apply
          </Button>
        )}
        <p className="text-muted-foreground font-mono text-xs">{opportunity.id}</p>
      </div>
    </>
  );
}

/** Spec F9: Prep me is offered on info sessions, coffee chats, and fairs. */
const PREPPABLE_TYPES = new Set(["info_session", "coffee_chat", "career_fair_booth", "networking"]);
const isPreppable = (type: string) => PREPPABLE_TYPES.has(type);

interface PrepResponse {
  pitch: string;
  questions: string[];
  talkingPoints: string[];
}

/** Generates (and caches) a pitch, 3 questions, and 3 talking points for one event (spec F9). */
function EventPrep({ eventId }: { eventId: string }) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | ({ status: "ready" } & PrepResponse)
  >({ status: "idle" });

  const generate = async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const body = (await res.json()) as PrepResponse & { error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Could not generate prep notes.");
      setState({ status: "ready", ...body });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  };

  if (state.status === "idle") {
    return (
      <Button variant="secondary" size="sm" onClick={() => void generate()}>
        <Sparkles className="size-3.5" aria-hidden="true" />
        Prep me
      </Button>
    );
  }

  if (state.status === "loading") {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        Writing your pitch and talking points...
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-2">
        <p className="text-danger text-xs">{state.message}</p>
        <Button variant="secondary" size="sm" onClick={() => void generate()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-surface-2 space-y-3 rounded-xl p-3 text-xs">
      <PrepBlock label="Your 30-second pitch" text={state.pitch} />
      <PrepList label="Smart questions to ask" items={state.questions} />
      <PrepList label="Talking points" items={state.talkingPoints} />
    </div>
  );
}

function PrepBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">{label}</p>
        <CopyButton text={text} />
      </div>
      <p className="text-foreground">{text}</p>
    </div>
  );
}

function PrepList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">{label}</p>
        <CopyButton text={items.join("\n")} />
      </div>
      <ul className="list-disc space-y-1 pl-4">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-muted-foreground hover:text-foreground text-[11px] underline underline-offset-2"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p>{value}</p>
    </div>
  );
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span key={value} className="bg-surface-2 rounded-full px-2 py-0.5 text-xs">
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
