// src/lib/prep.ts : Event Prep Mode (spec F9, 10.5). Generates a pitch, questions, and talking
// points from only the event/company rows and the student's profile — never invented facts.
import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { chatModel } from "@/lib/databricks/llm";
import { sql, T } from "@/lib/databricks/sql";
import { profileSummary } from "@/lib/agent/system-prompt";
import type { SkillProfile } from "@/lib/types";

export class EventNotFoundError extends Error {
  constructor(eventId: string) {
    super(`No event ${eventId}.`);
    this.name = "EventNotFoundError";
  }
}

interface EventForPrep {
  event_id: string;
  title: string;
  event_type: string;
  start_ts: string;
  location: string | null;
  host_name: string | null;
  company_id: string | null;
  company_name: string | null;
  industry: string | null;
  related_skills: string[] | null;
  description: string | null;
}

interface CompanyForPrep {
  company_id: string;
  company_name: string;
  industry: string | null;
  career_paths: string[] | null;
  sponsors_visa: boolean | null;
  hires_vt_students: boolean | null;
}

async function loadEvent(eventId: string): Promise<EventForPrep> {
  const rows = await sql<EventForPrep>(
    `SELECT event_id, title, event_type, start_ts, location, host_name, company_id, company_name,
            industry, related_skills, description
       FROM ${T("gold_events_enriched")} WHERE event_id = :id`,
    { id: eventId },
  );
  const row = rows[0];
  if (!row) throw new EventNotFoundError(eventId);
  return row;
}

async function loadCompany(companyId: string | null): Promise<CompanyForPrep | null> {
  if (!companyId) return null;
  const rows = await sql<CompanyForPrep>(
    `SELECT company_id, company_name, industry, career_paths, sponsors_visa, hires_vt_students
       FROM ${T("companies")} WHERE company_id = :id`,
    { id: companyId },
  );
  return rows[0] ?? null;
}

export const EventPrepSchema = z.object({
  pitch: z.string().max(700).describe("<= 80 words, first person, names 1-2 concrete experiences"),
  questions: z.array(z.string()).length(3),
  talking_points: z.array(z.string()).length(3),
});

export type EventPrep = z.infer<typeof EventPrepSchema>;

/** Spec 10.5. Every input is a catalog row or the student's own profile — nothing generated. */
export function prepPrompt(
  event: EventForPrep,
  company: CompanyForPrep | null,
  profile: SkillProfile,
  pathNames: Record<string, string>,
): string {
  return `Write prep notes for a Virginia Tech student attending this event.
EVENT: ${JSON.stringify(event)}
COMPANY: ${JSON.stringify(company)}
STUDENT: ${JSON.stringify(profileSummary(profile, pathNames))}

Return JSON: { "pitch": string (<= 80 words, first person, natural, names 1-2 concrete experiences),
 "questions": [3 specific questions about the role/team/recruiting timeline],
 "talking_points": [3 bullets linking the student's experience to what the company recruits for] }
Use only facts from the inputs above. Do not claim experiences the student does not have, and do not
invent event or company details that are not present in EVENT or COMPANY.`;
}

export async function generateEventPrep(
  eventId: string,
  profile: SkillProfile,
  pathNames: Record<string, string>,
): Promise<EventPrep> {
  const event = await loadEvent(eventId);
  const company = await loadCompany(event.company_id);

  const { object } = await generateObject({
    model: chatModel(),
    schema: EventPrepSchema,
    prompt: prepPrompt(event, company, profile, pathNames),
    temperature: 0.6,
    maxOutputTokens: 700,
  });
  return object;
}
