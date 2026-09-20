// src/lib/db/queries.ts : typed Lakebase reads/writes used by the app.
import "server-only";
import { q } from "./lakebase";

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
