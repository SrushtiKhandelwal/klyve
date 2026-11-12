import "server-only";

// A tiny "sliding window" rate limiter kept in the server's memory.
// It remembers when each user's recent uploads happened and says no once
// there are `max` of them inside the last `windowMs`.
//
// LIMITS of keeping it in memory (fine for one server, like Better Auth's
// rate limiter in src/lib/auth.ts):
// - counters reset when the server restarts,
// - with several servers each one counts separately.
// Move this to Redis or the database before running more than one server.

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

export function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;

  /** Forget users with no recent hits, so the map can't grow forever. */
  function sweep(now: number) {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= windowMs)) hits.delete(key);
    }
  }

  return {
    /** Records one attempt for `key` (if allowed) and says whether it may go ahead. */
    hit(key: string, now: number = Date.now()): RateLimitResult {
      sweep(now);
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        const retryAfterMs = windowMs - (now - recent[0]);
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
      }
      recent.push(now);
      hits.set(key, recent);
      return { ok: true, remaining: max - recent.length };
    },
    /** For tests. */
    reset() {
      hits.clear();
    },
  };
}
