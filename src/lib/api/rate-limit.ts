import "server-only";
import { normalizeIp } from "@/lib/tracking/ip";
import { TRANSACTIONAL_LIMITS } from "@/lib/transactional/schema";

// Rate limits for the public API.
//
//  1. Per API key: a "token bucket". Each key has a bucket that holds up to
//     `burst` tokens and refills at `requestsPerSecond` tokens per second.
//     Every request takes one token; an empty bucket means 429. So a key may
//     do short bursts of 20 requests, and 10 per second on average.
//
//  2. Per IP, for FAILED logins only: after 20 bad keys in a minute, that IP
//     gets 429 for the rest of the minute, even with a good key. This stops
//     anyone from trying key after key (and from hammering our database).
//     Keys are far too random to guess anyway; this keeps it that way.
//
// Both live in this server's memory, on globalThis so development hot
// reloads keep them. That's right for ONE server. If Klyve ever runs on
// several servers (Phase 10), swap these maps for a shared store (Redis /
// Postgres) so the limits are counted across all of them.

export type RateLimitHeaders = Record<string, string>;

// ── 1. Per key: token bucket ────────────────────────────────────────────────

type Bucket = { tokens: number; updatedAt: number };

const RATE = TRANSACTIONAL_LIMITS.requestsPerSecond; // tokens added per second
const BURST = TRANSACTIONAL_LIMITS.burst; // bucket size
/** A bucket untouched this long is full again anyway, so it can be forgotten. */
const IDLE_MS = 10 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 1000;
/** Safety net: never keep more entries than this (memory). */
const MAX_ENTRIES = 50_000;

type Store = {
  buckets: Map<string, Bucket>;
  failures: Map<string, { count: number; windowStart: number }>;
  lastSweep: number;
};
const holder = globalThis as unknown as { klyveApiRateLimit?: Store };
const store: Store = (holder.klyveApiRateLimit ??= { buckets: new Map(), failures: new Map(), lastSweep: Date.now() });

/** Every minute or so, forget idle buckets and expired failure windows. */
function sweep(now: number) {
  if (now - store.lastSweep < SWEEP_EVERY_MS) return;
  store.lastSweep = now;
  for (const [key, bucket] of store.buckets) if (now - bucket.updatedAt > IDLE_MS) store.buckets.delete(key);
  for (const [ip, entry] of store.failures) if (now - entry.windowStart >= FAIL_WINDOW_MS) store.failures.delete(ip);
}

/** Drops the oldest entries (Maps keep insertion order) if a map grew too big. */
function cap<V>(map: Map<string, V>) {
  if (map.size <= MAX_ENTRIES) return;
  for (const key of map.keys()) {
    map.delete(key);
    if (map.size <= MAX_ENTRIES * 0.9) break;
  }
}

export type KeyLimitResult = { ok: true; headers: RateLimitHeaders } | { ok: false; headers: RateLimitHeaders; retryAfter: number };

/**
 * Takes one token from this key's bucket. The headers (to add to EVERY
 * answer) tell the caller where they stand:
 *   RateLimit-Limit      the bucket size (max burst)
 *   RateLimit-Remaining  requests they can make right now
 *   RateLimit-Reset      seconds until the bucket is full again
 *   Retry-After          (only on 429) seconds to wait before retrying
 */
export function takeKeyToken(apiKeyId: string, now = Date.now()): KeyLimitResult {
  sweep(now);
  const existing = store.buckets.get(apiKeyId);
  const bucket: Bucket = existing ?? { tokens: BURST, updatedAt: now };
  // Refill for the time that passed since we last looked.
  bucket.tokens = Math.min(BURST, bucket.tokens + ((now - bucket.updatedAt) / 1000) * RATE);
  bucket.updatedAt = now;
  if (!existing) {
    store.buckets.set(apiKeyId, bucket);
    cap(store.buckets);
  }

  const allowed = bucket.tokens >= 1;
  if (allowed) bucket.tokens -= 1;

  const headers: RateLimitHeaders = {
    "RateLimit-Limit": String(BURST),
    "RateLimit-Remaining": String(Math.floor(bucket.tokens)),
    "RateLimit-Reset": String(Math.ceil((BURST - bucket.tokens) / RATE)),
  };
  if (allowed) return { ok: true, headers };
  const retryAfter = Math.max(1, Math.ceil((1 - bucket.tokens) / RATE));
  return { ok: false, retryAfter, headers: { ...headers, "Retry-After": String(retryAfter) } };
}

// ── 2. Per IP: failed authentication ────────────────────────────────────────

/** Bad keys allowed per IP per window. */
export const AUTH_FAILURES_PER_WINDOW = 20;
const FAIL_WINDOW_MS = 60 * 1000;

/**
 * The caller's IP, from the proxy headers. Same rule as clientIp() in
 * campaigns/unsubscribe.ts: the first X-Forwarded-For entry, else X-Real-IP.
 * In production Klyve sits behind a proxy (Caddy / nginx / the host) that
 * sets these; "unknown" when there's nothing usable.
 */
export function requestIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0];
  return normalizeIp(forwarded) ?? normalizeIp(headers.get("x-real-ip")) ?? "unknown";
}

/** null if this IP may try to authenticate, else seconds until it may again. */
export function authBlockedFor(ip: string, now = Date.now()): number | null {
  sweep(now);
  const entry = store.failures.get(ip);
  if (!entry || now - entry.windowStart >= FAIL_WINDOW_MS) return null;
  if (entry.count < AUTH_FAILURES_PER_WINDOW) return null;
  return Math.max(1, Math.ceil((entry.windowStart + FAIL_WINDOW_MS - now) / 1000));
}

/** Counts one failed authentication (wrong, revoked or malformed key) for this IP. */
export function recordAuthFailure(ip: string, now = Date.now()) {
  const entry = store.failures.get(ip);
  if (!entry || now - entry.windowStart >= FAIL_WINDOW_MS) {
    store.failures.set(ip, { count: 1, windowStart: now });
    cap(store.failures);
  } else {
    entry.count += 1;
  }
}

/** For tests: forget everything. */
export function resetRateLimits() {
  store.buckets.clear();
  store.failures.clear();
}
