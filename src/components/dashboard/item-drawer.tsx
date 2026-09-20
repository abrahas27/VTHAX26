"use client";

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
        {opportunity.deadline && <Row label="Deadline" value={formatDate(opportunity.deadline)} />}
        {opportunity.classYears.length > 0 && (
          <Row label="Class years" value={opportunity.classYears.join(", ")} />
        )}
        {opportunity.requiredSkills.length > 0 && (
          <ChipRow label="Required skills" values={opportunity.requiredSkills} />
        )}
        <p className="text-muted-foreground font-mono text-xs">{opportunity.id}</p>
      </div>
    </>
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
