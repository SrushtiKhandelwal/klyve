import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Proxy runs before every page request. It only does QUICK, optimistic
// redirects based on whether a login cookie exists — it never touches the
// database, so it can't tell whether that cookie is still valid.
// The real security checks happen on the server in each page/layout
// (requireUser / requireActiveWorkspace) and in every Server Action.

/** Pages that need a logged-in user (including everything under them). */
const PROTECTED_PATHS = [
  "/dashboard",
  "/contacts",
  "/campaigns",
  "/templates",
  "/forms",
  "/automations",
  "/transactional",
  "/statistics",
  "/library",
  "/settings",
  "/onboarding",
];

// Note: we deliberately do NOT redirect logged-in users away from /login and
// /signup here. The proxy can't tell if a cookie is still valid, so doing that
// would trap someone with an expired cookie in a /login <-> /dashboard loop.

function isUnder(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  // Only redirect normal page visits. Form submissions (Server Actions are
  // POST requests) must reach the page and do their own auth checks.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  // Checks the cookie EXISTS. It does not check that it is valid.
  const hasSessionCookie = getSessionCookie(request) !== null;

  if (!hasSessionCookie && isUnder(pathname, PROTECTED_PATHS)) {
    // Remember where they were going, so login can bring them back there.
    // (The login page only accepts same-site paths; see safe-next.ts.)
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  // Run on pages only: skip API routes, Next.js internals and any file with an
  // extension (images, favicon.ico, robots.txt, ...).
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
