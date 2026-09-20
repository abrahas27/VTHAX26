# Google OAuth (Sign in with Google) integration

## Purpose in HireUp

F1: any student signs in with a Google account (including @vt.edu Google accounts). Auth.js v5 issues a JWT
session; the session carries the Lakebase `userId` and an `isAdmin` flag that gates `/admin` (spec 12.1).

## Cost / free tier limits

Free. While the consent screen is in _Testing_, only listed test users can sign in (100 user cap), so add
every teammate and judge, or publish the app (basic scopes usually need no verification).

## Human steps (do these in order)

1. Google Cloud Console → create project `hokiepath`.
2. **APIs and Services → OAuth consent screen**: User type External, app name HireUp, support email,
   scopes `openid`, `email`, `profile`. Add teammates and judges as test users, or Publish.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. Authorized JavaScript origins: `http://localhost:3000` and `https://<your-app>.vercel.app`.
5. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` and
   `https://<your-app>.vercel.app/api/auth/callback/google`.
6. Copy the client ID/secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`; generate `AUTH_SECRET` with
   `npx auth secret`.
7. Optional: `ALLOWED_EMAIL_DOMAINS=vt.edu` to restrict sign-in; `ADMIN_EMAILS=a@vt.edu,b@vt.edu` for /admin.

## Environment variables

| Name                    | Example                                    | Where used                    | Secret? |
| ----------------------- | ------------------------------------------ | ----------------------------- | ------- |
| `AUTH_SECRET`           | 32+ random bytes                           | Auth.js session encryption    | yes     |
| `AUTH_GOOGLE_ID`        | `...apps.googleusercontent.com`            | Google provider               | yes     |
| `AUTH_GOOGLE_SECRET`    | `GOCSPX-...`                               | Google provider               | yes     |
| `ALLOWED_EMAIL_DOMAINS` | empty or `vt.edu`                          | `signIn` callback             | no      |
| `ADMIN_EMAILS`          | `a@vt.edu,b@vt.edu`                        | `jwt` callback, `/admin` gate | no      |
| `AUTH_URL`              | only if the deployment URL is not detected | Auth.js                       | no      |

## Code touchpoints

- `src/lib/auth.ts` — `NextAuth({...})` with JWT sessions; `signIn` enforces `isAllowedEmail`; `jwt` upserts
  the Lakebase user and sets `isAdmin`; `session` exposes `userId`/`isAdmin`. Pages: `signIn: "/"`,
  `error: "/unauthorized"`.
- `src/app/api/auth/[...nextauth]/route.ts` + `src/lib/auth-handlers.ts` — GET/POST handlers.
- `src/proxy.ts` — protects every page and `/api/*` except `/api/auth/*`, `/api/health`, `/`, `/unauthorized`.
- `src/components/sign-in-button.tsx` — server-action sign-in/sign-out.
- `src/app/start/page.tsx` — routes new users to `/onboarding`, returning users to `/dashboard`.
- Test: `tests/unit/auth-domain.test.ts`.

## Verify

- `curl -s -o /dev/null -w "%{http_code}" localhost:3000/dashboard` → 307 to `/?next=/dashboard`.
- `curl localhost:3000/api/tabs` → 401 JSON.
- In a browser: Continue with Google → lands on `/onboarding`.

## Failure modes and fallback

- `redirect_uri_mismatch`: the callback URL is not listed exactly (scheme, domain, path). Vercel preview URLs
  change per deploy, so test OAuth on the stable production domain.
- `AccessDenied` → `/unauthorized`: the email does not match `ALLOWED_EMAIL_DOMAINS`.
- `MissingSecret`: `AUTH_SECRET` is unset in production.
- Demo-day fallback: a pre-signed-in browser profile; DEMO_MODE demo user (spec 14.4).

## Security notes

Only `openid`, `email`, `profile` scopes; no Google API tokens are stored. Sessions are JWTs signed with
`AUTH_SECRET`; the client secret stays server-side. `isAdmin` is recomputed from `ADMIN_EMAILS` at sign-in and
enforced server-side in `src/proxy.ts`, never trusted from the client.
