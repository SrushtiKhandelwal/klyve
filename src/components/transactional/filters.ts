import { parseStatus } from "@/components/transactional/status";
import type { LogFilters } from "@/components/transactional/types";

// Reading and writing the logs filters (?status=&key=&to=&tag=).
// Pure functions: used by the page, the Server Action and the filter bar.
// Anything odd in the URL is simply ignored (no filter), never an error.

type Raw = Record<string, string | string[] | undefined> | null | undefined;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const clean = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s || null;
};

export function parseLogFilters(raw: Raw): LogFilters {
  const sp = raw ?? {};
  const key = clean(first(sp.key), 64);
  return {
    status: parseStatus(clean(first(sp.status), 20)),
    // Ids are cuid-like; anything else can't match and is dropped.
    key: key && /^[A-Za-z0-9_-]+$/.test(key) ? key : null,
    to: clean(first(sp.to), 254)?.toLowerCase() ?? null,
    tag: clean(first(sp.tag), 50),
  };
}

/** Filters → "?status=failed&tag=receipt" (or "" with no filters). */
export function filtersToSearch(f: LogFilters): string {
  const params = new URLSearchParams();
  if (f.status) params.set("status", f.status.toLowerCase());
  if (f.key) params.set("key", f.key);
  if (f.to) params.set("to", f.to);
  if (f.tag) params.set("tag", f.tag);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function hasFilters(f: LogFilters): boolean {
  return Boolean(f.status || f.key || f.to || f.tag);
}
