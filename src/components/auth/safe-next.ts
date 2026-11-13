// The "?next=" part of /login, /signup and /two-factor links: where to send
// the user once they're logged in (e.g. back to the team invite they opened).
//
// SECURITY: anyone can make a link like /login?next=https://evil.example, and
// after logging in the user would land on the attacker's look-alike site
// (an "open redirect"). So we only accept paths on THIS site:
//   ✓ "/invite/abc", "/dashboard?tab=1"
//   ✗ "https://evil.example", "//evil.example" (means "same protocol, other site"),
//     "/\evil.example" (some browsers read "\" as "/"), "javascript:..."
// Works the same in the browser and on the server (no imports).

const BASE = "http://same-site.invalid";

/** Returns `value` if it is a safe path on this site, otherwise null. */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > 1000) return null;
  // Must start with exactly one "/".
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  // No backslashes, spaces or invisible control characters anywhere.
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return null;

  // Final check: the browser's own URL parser must agree it stays on this site.
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  // API routes are never a page to land on.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Adds "?next=..." to an auth page link when `next` is safe, e.g. withNext("/signup", "/invite/abc"). */
export function withNext(path: string, next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe ? `${path}?next=${encodeURIComponent(safe)}` : path;
}
