import { getBrandTheme } from "@/lib/brand-kit";
import { renderStarterPreview } from "@/lib/templates/starters/preview";
import { getActiveWorkspace } from "@/lib/workspace";

// GET /templates/starters/<id>/preview → the starter's HTML in this
// workspace's brand, shown inside the gallery's thumbnail <iframe>s.
//
// WHY A URL (not srcDoc): the gallery has 20+ starters. Loading each preview
// from its own URL lets the browser fetch them in parallel and only when they
// scroll into view (<iframe loading="lazy">), instead of stuffing ~1 MB of
// HTML into the page. The render itself is cached (see preview.ts).

/** Extra safety for HTML we serve on our own domain. */
const SAFE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  // `sandbox` = treat this page like a sandboxed iframe even if someone opens
  // the URL directly: no scripts, no forms, no access to our cookies/origin.
  // Images may load from anywhere (emails use hosted images); nothing else.
  "Content-Security-Policy":
    "sandbox; default-src 'none'; img-src 'self' https: http: data:; style-src 'unsafe-inline'; font-src https:; frame-ancestors 'self'",
  "X-Content-Type-Options": "nosniff",
  // Brand-specific, so only the user's own browser may keep a copy.
  // The gallery adds ?v=<brand hash> to the URL, so a brand change gets a new URL.
  "Cache-Control": "private, max-age=86400",
  "Referrer-Policy": "no-referrer",
} as const;

export async function GET(_request: Request, ctx: { params: Promise<{ starterId: string }> }) {
  // Logged in and a member of a workspace? (This also picks WHICH brand to use.)
  const ws = await getActiveWorkspace();
  if (!ws) return new Response("Not logged in", { status: 401 });

  const { starterId } = await ctx.params;
  const theme = await getBrandTheme(ws);
  const html = await renderStarterPreview(String(starterId).slice(0, 60), theme);
  if (html === null) return new Response("Not found", { status: 404 });

  return new Response(html, { headers: SAFE_HEADERS });
}
