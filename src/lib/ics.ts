// src/lib/ics.ts : .ics calendar export (spec F10). Every timestamp is encoded as UTC ("Z"), so
// Google Calendar and Apple Calendar convert it to the viewer's local time correctly regardless of
// where they are — including America/New_York for VT students.
import { createEvents, type DateArray, type EventAttributes } from "ics";
import type { EventItem } from "@/lib/types";

function toUtcArray(iso: string): DateArray {
  const d = new Date(iso);
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  ];
}

/** Events rarely carry an explicit end time; default to a one-hour block. */
function endArray(event: EventItem): DateArray {
  if (event.end) return toUtcArray(event.end);
  const start = new Date(event.start);
  return toUtcArray(new Date(start.getTime() + 60 * 60_000).toISOString());
}

export function toEventAttributes(event: EventItem, baseUrl: string): EventAttributes {
  const descriptionLines = [
    event.companyName ? `Host: ${event.companyName}` : event.host ? `Host: ${event.host}` : null,
    event.skills.length > 0 ? `Skills: ${event.skills.join(", ")}` : null,
    `${baseUrl}/dashboard`,
  ].filter((line): line is string => Boolean(line));

  return {
    title: event.title,
    start: toUtcArray(event.start),
    startInputType: "utc",
    startOutputType: "utc",
    end: endArray(event),
    endInputType: "utc",
    endOutputType: "utc",
    location: event.location,
    description: descriptionLines.join("\n"),
    url: `${baseUrl}/dashboard`,
    uid: `${event.id}@hireup`,
    productId: "HireUp",
    calName: "HireUp",
  };
}

export interface IcsResult {
  ok: true;
  value: string;
}
export interface IcsError {
  ok: false;
  message: string;
}

export function buildIcs(events: EventItem[], baseUrl: string): IcsResult | IcsError {
  if (events.length === 0) return { ok: false, message: "No events to export." };
  const { error, value } = createEvents(events.map((e) => toEventAttributes(e, baseUrl)));
  if (error || !value)
    return { ok: false, message: error?.message ?? "Could not build the calendar file." };
  return { ok: true, value };
}
