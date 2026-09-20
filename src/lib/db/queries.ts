// src/lib/db/queries.ts : typed Lakebase reads/writes used by the app.
import "server-only";
import { q } from "./lakebase";
import type { ClassYear, Preferences, ProfileSkill, RoadmapItem, SkillProfile } from "@/lib/types";
import type { DashboardLayout, DashboardSpec } from "@/lib/agent/dashboard-spec";

export interface AppUser {
  user_id: string;
  email: string;
  display_name: string;
}

/**
 * First sign-in creates the row; later sign-ins refresh the display name and last_login_at (F1).
 * Returns the Lakebase UUID that the session carries as `userId`.
 */
export async function upsertUser(email: string, displayName: string): Promise<string> {
  const rows = await q<AppUser>(
    `INSERT INTO app_users (email, display_name, last_login_at)
     VALUES ($1, $2, now())
     ON CONFLICT (email) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           last_login_at = now()
     RETURNING user_id, email, display_name`,
    [email.toLowerCase(), displayName],
  );
  const user = rows[0];
  if (!user) throw new Error(`upsertUser returned no row for ${email}`);
  return user.user_id;
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const rows = await q<AppUser>(
    `SELECT user_id, email, display_name FROM app_users WHERE email = $1`,
    [email.toLowerCase()],
  );
  return rows[0] ?? null;
}

/** True once onboarding (F2 + F3) has been completed, used to route after sign-in. */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  const rows = await q<{ onboarded: boolean }>(
    `SELECT (onboarded_at IS NOT NULL) AS onboarded FROM student_profiles WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.onboarded ?? false;
}

// ---------------------------------------------------------------- student profile (F2, F3)

interface ProfileRow {
  user_id: string;
  display_name: string;
  major_code: string | null;
  class_year: string | null;
  resume_file_name: string | null;
  resume_text: string | null;
  parsed_skills: string[];
  skill_evidence: unknown;
  skill_levels: unknown;
  preferences: unknown;
  fit_scores: unknown;
  target_path_id: string | null;
  target_path_name: string | null;
  onboarded_at: Date | null;
}

export const EMPTY_PREFERENCES: Preferences = {
  seeking: [],
  interestedPaths: [],
  energizers: [],
  industries: [],
  locations: [],
  hoursPerWeek: "3-5",
  flags: {},
};

/**
 * `parsed_skills` (TEXT[]) stays the queryable list of canonical names, while `skill_evidence`
 * carries the full ProfileSkill objects, so the review screen keeps levels and evidence.
 */
function rowToProfile(row: ProfileRow): SkillProfile {
  const evidence = Array.isArray(row.skill_evidence) ? (row.skill_evidence as ProfileSkill[]) : [];
  const levels = (row.skill_levels ?? {}) as Record<string, number>;
  const skills: ProfileSkill[] =
    evidence.length > 0
      ? evidence
      : (row.parsed_skills ?? []).map((name) => ({
          name,
          level: (levels[name] ?? 2) as ProfileSkill["level"],
          source: "resume" as const,
          canonical: true,
        }));

  return {
    userId: row.user_id,
    displayName: row.display_name,
    majorCode: row.major_code,
    classYear: (row.class_year as ClassYear | null) ?? null,
    skills,
    preferences: { ...EMPTY_PREFERENCES, ...((row.preferences ?? {}) as Partial<Preferences>) },
    fitScores: (row.fit_scores ?? {}) as Record<string, number>,
    primaryGoal: row.target_path_id,
  };
}

export async function getProfile(userId: string): Promise<SkillProfile | null> {
  const rows = await q<ProfileRow>(
    `SELECT u.user_id, u.display_name, p.major_code, p.class_year, p.resume_file_name,
            p.resume_text, p.parsed_skills, p.skill_evidence, p.skill_levels, p.preferences,
            p.fit_scores, p.target_path_id, p.target_path_name, p.onboarded_at
       FROM app_users u
       LEFT JOIN student_profiles p ON p.user_id = u.user_id
      WHERE u.user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return rowToProfile(row);
}

export interface SaveProfileInput {
  userId: string;
  majorCode?: string | null;
  classYear?: ClassYear | null;
  skills?: ProfileSkill[];
  resumeFileName?: string | null;
  resumeText?: string | null;
  preferences?: Preferences;
  fitScores?: Record<string, number>;
  primaryGoal?: string | null;
  primaryGoalName?: string | null;
  markOnboarded?: boolean;
}

/** Upsert the parts of a profile that were supplied; COALESCE keeps manual edits intact. */
export async function saveProfile(input: SaveProfileInput): Promise<void> {
  const skillNames = input.skills?.map((s) => s.name) ?? null;
  const levels = input.skills
    ? Object.fromEntries(input.skills.map((s) => [s.name, s.level]))
    : null;

  await q(
    `INSERT INTO student_profiles
       (user_id, major_code, class_year, resume_file_name, resume_text, parsed_skills,
        skill_evidence, skill_levels, preferences, fit_scores, target_path_id, target_path_name,
        onboarded_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::text[], '{}'),
             COALESCE($7::jsonb, '[]'::jsonb), COALESCE($8::jsonb, '{}'::jsonb),
             COALESCE($9::jsonb, '{}'::jsonb), COALESCE($10::jsonb, '{}'::jsonb), $11, $12,
             CASE WHEN $13 THEN now() ELSE NULL END, now())
     ON CONFLICT (user_id) DO UPDATE SET
       major_code       = COALESCE($2, student_profiles.major_code),
       class_year       = COALESCE($3, student_profiles.class_year),
       resume_file_name = COALESCE($4, student_profiles.resume_file_name),
       resume_text      = COALESCE($5, student_profiles.resume_text),
       parsed_skills    = COALESCE($6::text[], student_profiles.parsed_skills),
       skill_evidence   = COALESCE($7::jsonb, student_profiles.skill_evidence),
       skill_levels     = COALESCE($8::jsonb, student_profiles.skill_levels),
       preferences      = COALESCE($9::jsonb, student_profiles.preferences),
       fit_scores       = COALESCE($10::jsonb, student_profiles.fit_scores),
       target_path_id   = COALESCE($11, student_profiles.target_path_id),
       target_path_name = COALESCE($12, student_profiles.target_path_name),
       onboarded_at     = CASE WHEN $13 THEN now() ELSE student_profiles.onboarded_at END,
       updated_at       = now()`,
    [
      input.userId,
      input.majorCode ?? null,
      input.classYear ?? null,
      input.resumeFileName ?? null,
      input.resumeText ?? null,
      skillNames,
      input.skills ? JSON.stringify(input.skills) : null,
      levels ? JSON.stringify(levels) : null,
      input.preferences ? JSON.stringify(input.preferences) : null,
      input.fitScores ? JSON.stringify(input.fitScores) : null,
      input.primaryGoal ?? null,
      input.primaryGoalName ?? null,
      input.markOnboarded ?? false,
    ],
  );
}

/** Spec 14.2: delete-my-data removes every row for this user (cascades from app_users). */
export async function deleteUser(userId: string): Promise<void> {
  await q(`DELETE FROM app_users WHERE user_id = $1`, [userId]);
}

// ---------------------------------------------------------------- chat + goal tabs (F5, F6)

export async function getDashboardLayout(userId: string): Promise<DashboardLayout> {
  const rows = await q<{ layout: unknown }>(
    `SELECT layout FROM dashboard_state WHERE user_id = $1`,
    [userId],
  );
  const layout = rows[0]?.layout as { tabs?: DashboardSpec[] } | undefined;
  return { tabs: Array.isArray(layout?.tabs) ? layout.tabs : [] };
}

/** Bump `version` on every write so the client can tell a tab actually changed (spec 10.6). */
export async function saveDashboardLayout(
  userId: string,
  layout: DashboardLayout,
  activeGoal: string | null,
): Promise<number> {
  const rows = await q<{ version: number }>(
    `INSERT INTO dashboard_state (user_id, active_goal, layout, version, updated_by, updated_at)
     VALUES ($1, $2, $3::jsonb, 1, 'agent', now())
     ON CONFLICT (user_id) DO UPDATE
       SET active_goal = COALESCE($2, dashboard_state.active_goal),
           layout = $3::jsonb,
           version = dashboard_state.version + 1,
           updated_by = 'agent',
           updated_at = now()
     RETURNING version`,
    [userId, activeGoal, JSON.stringify(layout)],
  );
  return rows[0]?.version ?? 1;
}

export async function replaceDashboardTabs(userId: string, tabs: DashboardSpec[]): Promise<number> {
  const rows = await q<{ version: number }>(
    `UPDATE dashboard_state
        SET layout = $2::jsonb, version = version + 1, updated_by = 'user', updated_at = now()
      WHERE user_id = $1
      RETURNING version`,
    [userId, JSON.stringify({ tabs })],
  );
  return rows[0]?.version ?? 1;
}

export async function ensureChatSession(userId: string, sessionId?: string): Promise<string> {
  if (sessionId) {
    const existing = await q<{ session_id: string }>(
      `SELECT session_id FROM chat_sessions WHERE session_id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
    if (existing[0]) return existing[0].session_id;
  }
  const rows = await q<{ session_id: string }>(
    `INSERT INTO chat_sessions (user_id) VALUES ($1) RETURNING session_id`,
    [userId],
  );
  const created = rows[0]?.session_id;
  if (!created) throw new Error("Could not create a chat session");
  return created;
}

export async function saveChatMessage(input: {
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: unknown;
}): Promise<void> {
  await q(
    `INSERT INTO chat_messages (session_id, role, content, tool_calls)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      input.sessionId,
      input.role,
      input.content,
      input.toolCalls ? JSON.stringify(input.toolCalls) : null,
    ],
  );
}

export interface ChatMessageRow {
  message_id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls: unknown;
  created_at: string;
}

export async function listChatMessages(
  userId: string,
  sessionId: string,
): Promise<ChatMessageRow[]> {
  return q<ChatMessageRow>(
    `SELECT m.message_id, m.role, m.content, m.tool_calls, m.created_at
       FROM chat_messages m
       JOIN chat_sessions s ON s.session_id = m.session_id
      WHERE m.session_id = $1 AND s.user_id = $2
      ORDER BY m.created_at`,
    [sessionId, userId],
  );
}

/** Lightweight trace log used by the MLflow evaluation in P4 (spec 10.8, 15.3). */
export async function logAgentTurn(input: {
  userId: string;
  sessionId: string;
  question: string;
  answer: string;
  toolCalls: unknown;
  latencyMs: number;
  model: string;
}): Promise<void> {
  await q(
    `INSERT INTO agent_turns (user_id, session_id, question, answer, tool_calls, latency_ms, model)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      input.userId,
      input.sessionId,
      input.question,
      input.answer,
      JSON.stringify(input.toolCalls),
      input.latencyMs,
      input.model,
    ],
  );
}

// ---------------------------------------------------------------- roadmap (F7)

export interface StoredRoadmapItem {
  roadmap_item_id: string;
  item_type: string;
  item_id: string | null;
  name: string;
  when_text: string | null;
  closes_gaps: string[];
  sort_order: number;
  completed: boolean;
}

/**
 * Mirror the UC Function's plan into Lakebase, preserving completion state. The function is the
 * source of truth for which items belong on the plan and in what order; Lakebase only remembers
 * what the student ticked off.
 */
export async function syncRoadmapItems(
  userId: string,
  goal: string,
  items: RoadmapItem[],
): Promise<void> {
  const keys = items.map((item) => item.itemId ?? item.name);
  await q(
    `DELETE FROM roadmap_items
      WHERE user_id = $1 AND goal = $2
        AND COALESCE(item_id, name) <> ALL($3::text[])`,
    [userId, goal, keys],
  );

  for (const [index, item] of items.entries()) {
    await q(
      `INSERT INTO roadmap_items (user_id, goal, item_type, item_id, name, when_text, closes_gaps, sort_order)
       SELECT $1, $2, $3, $4, $5, $6, $7::text[], $8
        WHERE NOT EXISTS (
          SELECT 1 FROM roadmap_items
           WHERE user_id = $1 AND goal = $2 AND COALESCE(item_id, name) = COALESCE($4, $5))`,
      [userId, goal, item.itemType, item.itemId, item.name, item.whenText, item.closesGaps, index],
    );
    await q(
      `UPDATE roadmap_items
          SET sort_order = $6, when_text = $5, closes_gaps = $4::text[], name = $3
        WHERE user_id = $1 AND goal = $2 AND COALESCE(item_id, name) = COALESCE($7, $3)`,
      [userId, goal, item.name, item.closesGaps, item.whenText, index, item.itemId],
    );
  }
}

export async function listRoadmapItems(userId: string, goal: string): Promise<StoredRoadmapItem[]> {
  return q<StoredRoadmapItem>(
    `SELECT roadmap_item_id, item_type, item_id, name, when_text, closes_gaps, sort_order, completed
       FROM roadmap_items WHERE user_id = $1 AND goal = $2
      ORDER BY sort_order`,
    [userId, goal],
  );
}

// ---------------------------------------------------------------- event prep (F9)

export interface StoredEventPrep {
  event_id: string;
  pitch: string;
  questions: string[];
  talking_points: string[];
  created_at: string;
}

export async function getEventPrep(
  userId: string,
  eventId: string,
): Promise<StoredEventPrep | null> {
  const rows = await q<StoredEventPrep>(
    `SELECT event_id, pitch, questions, talking_points, created_at
       FROM event_prep WHERE user_id = $1 AND event_id = $2`,
    [userId, eventId],
  );
  return rows[0] ?? null;
}

/** Cached so re-opening the same event's drawer does not re-call the model (spec F9). */
export async function saveEventPrep(input: {
  userId: string;
  eventId: string;
  pitch: string;
  questions: string[];
  talkingPoints: string[];
}): Promise<void> {
  await q(
    `INSERT INTO event_prep (user_id, event_id, pitch, questions, talking_points)
     VALUES ($1, $2, $3, $4::text[], $5::text[])
     ON CONFLICT (user_id, event_id) DO UPDATE
       SET pitch = EXCLUDED.pitch, questions = EXCLUDED.questions,
           talking_points = EXCLUDED.talking_points, created_at = now()`,
    [input.userId, input.eventId, input.pitch, input.questions, input.talkingPoints],
  );
}

export async function setRoadmapItemCompleted(
  userId: string,
  roadmapItemId: string,
  completed: boolean,
): Promise<StoredRoadmapItem | null> {
  const rows = await q<StoredRoadmapItem>(
    `UPDATE roadmap_items SET completed = $3
      WHERE user_id = $1 AND roadmap_item_id = $2
      RETURNING roadmap_item_id, item_type, item_id, name, when_text, closes_gaps, sort_order, completed`,
    [userId, roadmapItemId, completed],
  );
  return rows[0] ?? null;
}
