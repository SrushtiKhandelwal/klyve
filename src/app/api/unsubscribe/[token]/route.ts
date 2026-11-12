import type { NextRequest } from "next/server";
import { clientIp, unsubscribeByToken, unsubscribeRateLimiter } from "@/lib/campaigns/unsubscribe";

// One-click unsubscribe (RFC 8058), the address in every campaign email's
//   List-Unsubscribe: <https://app/api/unsubscribe/<token>>
//   List-Unsubscribe-Post: List-Unsubscribe=One-Click
// headers. Gmail, Yahoo and Apple Mail show their own "Unsubscribe" button and
// POST "List-Unsubscribe=One-Click" here from THEIR servers, with no cookies.
//
// Why there's no CSRF / Origin check: this is a deliberate cross-site POST
// from mail providers. The signed token is the whole authorization, and it
// can only ever unsubscribe the one person it was made for.
//
// We answer invalid and valid tokens the same way, so this endpoint can't be
// used to test which tokens are real. An invalid token changes nothing.

const HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

const DONE = "You have been unsubscribed.";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/unsubscribe/[token]">) {
  const limit = unsubscribeRateLimiter.hit(`one-click:${clientIp(request.headers)}`);
  if (!limit.ok) {
    return new Response("Too many requests. Please try again shortly.", {
      status: 429,
      headers: { ...HEADERS, "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const { token } = await ctx.params;
  // We don't insist on the exact "List-Unsubscribe=One-Click" body: a working
  // unsubscribe is a legal duty, so any POST to a valid link unsubscribes.
  // (Link scanners only GET, and GET never unsubscribes.)
  try {
    await unsubscribeByToken(token);
  } catch (err) {
    // A database hiccup: say so (the mail provider may retry), but give no details.
    console.error("[unsubscribe] one-click failed", err);
    return new Response("Something went wrong. Please try again.", { status: 500, headers: HEADERS });
  }
  return new Response(DONE, { status: 200, headers: HEADERS });
}

/**
 * Some mail apps open the List-Unsubscribe address in a browser (GET). We
 * never unsubscribe on GET (prefetchers and link scanners do GETs), so we
 * send them to the normal page, which asks for a click.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  const target = new URL(`/u/${encodeURIComponent(token)}`, request.nextUrl.origin);
  return new Response(null, {
    status: 303,
    headers: { Location: target.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
