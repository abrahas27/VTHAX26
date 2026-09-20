// src/lib/db/queries.ts : typed Lakebase reads/writes used by the app.
import "server-only";
import { q } from "./lakebase";
import type { ClassYear, Preferences, ProfileSkill, SkillProfile } from "@/lib/types";

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
