// Session/JWT fields HokiePath adds in src/lib/auth.ts.
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    /** Lakebase app_users.user_id; undefined until Lakebase is reachable. */
    userId?: string;
    isAdmin: boolean;
  }
}

// The JWT interface lives in @auth/core, which is not a direct dependency, so it cannot be
// augmented from here. src/lib/auth.ts narrows token claims at the point of use instead.
