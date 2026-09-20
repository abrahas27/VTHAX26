// src/lib/auth.ts : Auth.js v5 with Google, JWT sessions, no DB adapter (spec F1, 12.1).
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "@/lib/env";
import { lakebaseConfigured } from "@/lib/db/lakebase";
import { upsertUser } from "@/lib/db/queries";

/** Empty ALLOWED_EMAIL_DOMAINS means any Google account; otherwise the email must match one. */
export function isAllowedEmail(email: string | undefined | null, domains: string[]): boolean {
  if (!email) return false;
  if (domains.length === 0) return true;
  const lower = email.toLowerCase();
  return domains.some((d) => lower.endsWith(`@${d}`));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google], // reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
  session: { strategy: "jwt" },
  pages: { signIn: "/", error: "/unauthorized" },
  callbacks: {
    signIn({ profile }) {
      return isAllowedEmail(profile?.email, env.ALLOWED_EMAIL_DOMAINS);
    },
    async jwt({ token, profile }) {
      // `profile` is only present on the first call after a successful sign-in.
      const email = profile?.email ?? token.email;
      if (profile?.email) {
        token.isAdmin = env.ADMIN_EMAILS.includes(profile.email.toLowerCase());
      }
      if (email && typeof token.userId !== "string" && lakebaseConfigured()) {
        try {
          token.userId = await upsertUser(email, profile?.name ?? token.name ?? email);
        } catch (err) {
          // Sign-in should still work while Lakebase is being set up (spec 11.8); routes that
          // need per-user state check for a missing userId themselves.
          console.error("[auth] upsertUser failed; continuing without a Lakebase user id", err);
        }
      }
      return token;
    },
    session({ session, token }) {
      // JWT claims are typed as `unknown` (the @auth/core JWT interface is an index signature and
      // is not resolvable from here for augmentation), so narrow them explicitly.
      if (typeof token.userId === "string") session.userId = token.userId;
      session.isAdmin = token.isAdmin === true;
      return session;
    },
  },
});
