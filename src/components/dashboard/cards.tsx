"use client";

import { CalendarDays, ExternalLink, GraduationCap, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  daysUntil,
  eventTypeLabel,
  formatDate,
  formatEventTime,
  opportunityTypeLabel,
  urgency,
} from "@/lib/format";
import type { ClubItem, EventItem, OpportunityItem, RoadmapItem, VisitItem } from "@/lib/types";

/** Why-this chips explain every recommendation in the student's own terms (spec 5.7). */
function WhyChips({ why }: { why?: string[] }) {
  if (!why?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {why.map((reason) => (
        <span
          key={reason}
          className="bg-surface-2 text-muted-foreground rounded-full px-2 py-0.5 text-xs"
        >
          {reason}
        </span>
      ))}
    </div>
  );
}

export function EventCard({ event, onOpen }: { event: EventItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="border-border hover:bg-surface-2 focus-visible:ring-ring w-full rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{event.title}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {formatEventTime(event.start)} · {event.location}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 text-xs">
          {eventTypeLabel(event.type)}
        </Badge>
      </div>
      <WhyChips why={event.why} />
    </button>
  );
}

export function RecruiterTimeline({
  visits,
  onOpen,
}: {
  visits: VisitItem[];
  onOpen: (visit: VisitItem) => void;
}) {
  if (visits.length === 0) {
    return <p className="text-muted-foreground text-sm">No company visits in this window.</p>;
  }
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {visits.map((visit) => (
        <button
          key={`${visit.id}-${visit.companyName}`}
          type="button"
          onClick={() => onOpen(visit)}
          className="border-border hover:bg-surface-2 focus-visible:ring-ring min-h-11 min-w-[190px] shrink-0 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <p className="text-accent text-xs font-medium">{formatDate(visit.visitDate)}</p>
          <p className="mt-1 truncate text-sm font-medium">{visit.companyName}</p>
          <p className="text-muted-foreground text-xs">{eventTypeLabel(visit.visitType)}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {visit.alumniAttending && (
              <Badge variant="outline" className="text-[10px]">
                VT alumni
              </Badge>
            )}
            {visit.onCampusInterviews && (
              <Badge variant="outline" className="text-[10px]">
                OCI
              </Badge>
            )}
            {visit.matchesGoal && (
              <Badge className="bg-accent text-accent-foreground text-[10px]">Your goal</Badge>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

export function ClubCard({ club, onOpen }: { club: ClubItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="border-border hover:bg-surface-2 focus-visible:ring-ring min-h-11 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <p className="truncate text-sm font-medium">{club.name}</p>
      <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
        <Users className="size-3" aria-hidden="true" />
        {club.meetingDay ? `${club.meetingDay} ${club.meetingTime ?? ""}`.trim() : club.category}
      </p>
      {club.skills.length > 0 && (
        <p className="text-muted-foreground mt-2 truncate text-xs">
          Builds {club.skills.slice(0, 3).join(", ")}
        </p>
      )}
    </button>
  );
}

export function OpportunityCard({
  opportunity,
  onOpen,
}: {
  opportunity: OpportunityItem;
  onOpen: () => void;
}) {
  const level = urgency(opportunity.deadline);
  const days = opportunity.deadline ? daysUntil(opportunity.deadline) : null;
  return (
    // A div, not a button: a real posting carries an Apply link, and a link nested inside a
    // button is invalid markup and unreachable by keyboard.
    <div className="border-border hover:bg-surface-2 focus-within:ring-ring rounded-xl border transition-colors focus-within:ring-2">
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-xl p-4 text-left focus-visible:outline-none"
      >
        <div className="flex min-h-11 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{opportunity.title}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {opportunity.companyName}
              {opportunity.location ? ` · ${opportunity.location}` : ""}
            </p>
          </div>
          {days !== null && days >= 0 && (
            <span
              className={
                level === "urgent"
                  ? "text-danger shrink-0 text-xs font-medium"
                  : level === "soon"
                    ? "text-warning shrink-0 text-xs font-medium"
                    : "text-muted-foreground shrink-0 text-xs"
              }
            >
              due {days}d{opportunity.deadlineEstimated ? "*" : ""}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {opportunityTypeLabel(opportunity.type)}
          </Badge>
          {/* An inferred deadline is never shown as if the employer published it (spec 1.1). */}
          {opportunity.deadlineEstimated && (
            <span className="text-muted-foreground text-[10px]">* deadline estimated</span>
          )}
        </div>
      </button>

      {opportunity.applyUrl && (
        <div className="border-border border-t px-4">
          <a
            href={opportunity.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 items-center gap-1.5 text-xs focus-visible:ring-2 focus-visible:outline-none"
          >
            Apply on the company site
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}

const ROADMAP_ICONS: Record<RoadmapItem["itemType"], typeof CalendarDays> = {
  event: CalendarDays,
  club: Users,
  course: GraduationCap,
  opportunity: ExternalLink,
  action: MapPin,
};

export function RoadmapPreview({ items }: { items: RoadmapItem[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">No roadmap items yet.</p>;
  }
  return (
    <ol className="space-y-3">
      {items.map((item, index) => {
        const Icon = ROADMAP_ICONS[item.itemType] ?? MapPin;
        return (
          <li key={`${item.itemId ?? item.name}-${index}`} className="flex gap-3">
            <Icon
              className="text-accent mt-0.5 size-4 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-sm">{item.name}</p>
              <p className="text-muted-foreground text-xs">
                {item.whenText ?? "Ongoing"}
                {item.closesGaps.length > 0 &&
                  ` · closes ${item.closesGaps.length} gap${item.closesGaps.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
