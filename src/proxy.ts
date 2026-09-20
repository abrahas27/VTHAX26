// src/proxy.ts : route protection (spec F1). Next 16 renamed `middleware` to `proxy`;
// it runs on the Node.js runtime and must not set a `runtime` config option.
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

/** Pages a signed-out visitor may see. Everything else redirects to the landing page. */
const PUBLIC_PAGES = new Set(["/", "/unauthorized"]);

/**
 * API routes that never require a session (spec 9). `/api/cron/*` has no user to sign in as —
 * Vercel Cron calls it directly — so it checks its own CRON_SECRET instead (spec 11.9).
 */
const isPublicApi = (path: string) =>
  path.startsWith("/api/auth/") || path === "/api/health" || path.startsWith("/api/cron/");

function unauthorized() {
  return NextResponse.json(
    { error: { code: "unauthorized", message: "Sign in to continue." } },
    { status: 401 },
  );
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  if (isApi ? isPublicApi(pathname) : PUBLIC_PAGES.has(pathname)) return NextResponse.next();

  const session = await auth();
  if (!session) {
    if (isApi) return unauthorized();
    const url = new URL("/", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // /admin and /api/admin/* additionally require an ADMIN_EMAILS account.
  if ((pathname === "/admin" || pathname.startsWith("/api/admin")) && !session.isAdmin) {
    return isApi
      ? NextResponse.json(
          { error: { code: "forbidden", message: "Admin access required." } },
          { status: 403 },
        )
      : NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static files; everything else goes through the checks above.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
