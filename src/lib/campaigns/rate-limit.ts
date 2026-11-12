import "server-only";

// Speed limit for one sending provider ("at most N emails per second").
//
// How: emails are spaced EVENLY, one every 1000/N milliseconds. With N = 2
// that is one email every 500 ms. Spacing (instead of "send N, then wait a
// second") means we never burst above the limit in any one-second window,
// which is what providers like Amazon SES actually measure.
//
// Each caller "books" the next free time slot synchronously (JavaScript runs
// one piece of code at a time, so two callers can't book the same slot),
// then waits until that slot arrives.
//
// LIMITATION: the limiter lives in this process's memory. With ONE worker
// process (the default) that is exact. If you run several worker processes
// against the same database, each has its own limiter, so a provider could
// receive up to (number of workers × N) emails per second. Phase 10 plans a
// shared store (e.g. Redis) for that case.

export class RateLimiter {
  private nextSlotAt = 0;

  constructor(private perSecond: number) {
    this.setRate(perSecond);
  }

  /** Changes the speed (e.g. the user edited the provider's limit). */
  setRate(perSecond: number): void {
    // At least 1/s, at most 1000/s: a 0 or broken value must not stop or flood sending.
    this.perSecond = Math.min(1000, Math.max(1, Math.floor(perSecond) || 1));
  }

  get rate(): number {
    return this.perSecond;
  }

  /** Waits until we may send the next email. */
  async take(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = slot + 1000 / this.perSecond;
    if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
  }
}

// One limiter per provider, kept on globalThis so a hot reload in development
// doesn't create a second set (which would double the speed).
const store = globalThis as unknown as { klyveRateLimiters?: Map<string, RateLimiter> };

/** The limiter for a provider, created on first use and kept up to date with its rate. */
export function limiterFor(providerId: string, perSecond: number): RateLimiter {
  store.klyveRateLimiters ??= new Map();
  let limiter = store.klyveRateLimiters.get(providerId);
  if (!limiter) {
    limiter = new RateLimiter(perSecond);
    store.klyveRateLimiters.set(providerId, limiter);
  } else if (limiter.rate !== perSecond) {
    limiter.setRate(perSecond);
  }
  return limiter;
}
