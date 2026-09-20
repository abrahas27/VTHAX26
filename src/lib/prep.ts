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

interface EventWithCompanyRow extends EventForPrep {
  c_company_id: string | null;
  c_company_name: string | null;
  c_industry: string | null;
  c_career_paths: string[] | null;
  c_sponsors_visa: boolean | null;
  c_hires_vt_students: boolean | null;
}

/**
 * One statement, not two. Every Statement Execution API call costs ~600-900 ms of round trip
 * regardless of how little it reads, and the company row is only ever needed for this event --
 * so the join belongs in the warehouse rather than in two awaits here (spec 6.4).
 */
async function loadEventAndCompany(
  eventId: string,
): Promise<{ event: EventForPrep; company: CompanyForPrep | null }> {
  const rows = await sql<EventWithCompanyRow>(
    `SELECT e.event_id, e.title, e.event_type, e.start_ts, e.location, e.host_name, e.company_id,
            e.company_name, e.industry, e.related_skills, e.description,
            c.company_id AS c_company_id, c.company_name AS c_company_name,
            c.industry AS c_industry, c.career_paths AS c_career_paths,
            c.sponsors_visa AS c_sponsors_visa, c.hires_vt_students AS c_hires_vt_students
       FROM ${T("gold_events_enriched")} e
       LEFT JOIN ${T("companies")} c ON c.company_id = e.company_id
      WHERE e.event_id = :id`,
    { id: eventId },
  );
  const row = rows[0];
  if (!row) throw new EventNotFoundError(eventId);

  const {
    c_company_id,
    c_company_name,
    c_industry,
    c_career_paths,
    c_sponsors_visa,
    c_hires_vt_students,
    ...event
  } = row;

  return {
    event,
    company:
      c_company_id && c_company_name
        ? {
            company_id: c_company_id,
            company_name: c_company_name,
            industry: c_industry,
            career_paths: c_career_paths,
            sponsors_visa: c_sponsors_visa,
            hires_vt_students: c_hires_vt_students,
          }
        : null,
  };
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
  const { event, company } = await loadEventAndCompany(eventId);

  const { object } = await generateObject({
    model: chatModel(),
    schema: EventPrepSchema,
    prompt: prepPrompt(event, company, profile, pathNames),
    temperature: 0.6,
    maxOutputTokens: 700,
  });
  return object;
}
