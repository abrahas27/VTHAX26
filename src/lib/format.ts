// Display helpers shared by the dashboard cards. All times are America/New_York (spec F10).
export const TIME_ZONE = "America/New_York";

export function formatEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** Whole days from now until `iso`, negative once it is in the past. */
export function daysUntil(iso: string, now = new Date()): number {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

/** Deadline urgency (spec 5.7): orange under 14 days, red under 3. */
export function urgency(iso: string | null, now = new Date()): "none" | "soon" | "urgent" {
  if (!iso) return "none";
  const days = daysUntil(iso, now);
  if (days < 0) return "none";
  if (days <= 3) return "urgent";
  if (days <= 14) return "soon";
  return "none";
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  info_session: "Info session",
  coffee_chat: "Coffee chat",
  career_fair_booth: "Career fair",
  technical_workshop: "Workshop",
  workshop: "Workshop",
  networking: "Networking",
  panel: "Panel",
  club_meeting: "Club meeting",
  hackathon: "Hackathon",
  on_campus_interview: "On-campus interviews",
  research_talk: "Research talk",
};

export const eventTypeLabel = (type: string) =>
  EVENT_TYPE_LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const opportunityTypeLabel = (type: string) =>
  ({ internship: "Internship", full_time: "Full-time", research: "Research" })[type] ??
  eventTypeLabel(type);
