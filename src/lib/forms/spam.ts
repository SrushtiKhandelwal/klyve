import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createRateLimiter } from "@/lib/media/rate-limit";

// Spam protection for PUBLIC sign-up forms (the hosted /f page and the
// cross-site POST /api/forms/<id>/submit). Nobody is logged in there, so we
// can't trust anything about the visitor. Four cheap layers:
//
//  1. Honeypot: a hidden field (HONEYPOT_FIELD) real people never see or fill
//     in. Simple bots fill every field they find.
//  2. Timing: the hosted page embeds a SIGNED "form was shown at" timestamp
//     (RENDERED_AT_FIELD). A human needs a few seconds to type an address;
//     a bot posts instantly. Missing, forged or too-fast = spam.
//     The plain HTML snippet that other websites paste (a <form> posting to
//     our API) has NO timestamp, because the website can't sign one. There we
//     accept the missing timestamp and rely on the honeypot, the rate limits
//     and (when switched on) double opt-in instead.
//  3. Rate limits (below): per IP per form, per form, and per email address.
//  4. Size caps: request bodies over ~20 KB and over-long fields are refused.
//
// Spam caught by 1 or 2 gets the SAME "thanks" answer as a real sign-up, so
// bots can't learn what tripped them. It is recorded as a SPAM submission so
// the form's owner can see it in the stats.
//
// Disposable-email domains are NOT blocked: lists go stale constantly and
// block real people. Double opt-in is the real fix for fake addresses.

/** Size limits for anything a public form sends us. */
export const FORM_SIZE_LIMITS = {
  /** Whole request body (the cross-site endpoint checks this before parsing). */
  bodyBytes: 20 * 1024,
  /** One field's value. Anything longer is refused ("too long"). */
  valueChars: 1000,
  /** How many fields we even look at (forms have at most 12 + a few hidden). */
  fieldCount: 50,
} as const;

/** A human needs at least this long between seeing the form and sending it. */
export const MIN_FILL_MS = 2_500;
/** After this long the signed timestamp is stale (the tab was open for a day). */
export const MAX_FILL_MS = 24 * 60 * 60 * 1000;

// ── Signed "rendered at" timestamp ─────────────────────────────────────────

function timestampKey(): Buffer {
  const base = process.env.ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;
  if (!base) throw new Error("ENCRYPTION_KEY is not set (see .env.example).");
  // Derived and labelled, so this key can't be mixed up with the encryption
  // key or the recipient-token keys.
  return createHash("sha256").update(`klyve-form-rendered-at:${base}`).digest();
}

function signTimestamp(formId: string, ms: number): string {
  return createHmac("sha256", timestampKey()).update(`${formId}.${ms}`).digest("base64url").slice(0, 32);
}

/** "<milliseconds>.<signature>", put in the hidden RENDERED_AT_FIELD. */
export function createRenderedAtToken(formId: string, now: number = Date.now()): string {
  return `${now}.${signTimestamp(formId, now)}`;
}

export type TimestampCheck = "ok" | "missing" | "invalid" | "too_fast" | "expired";

/**
 * Checks the hidden timestamp. The signature includes the form id, so a token
 * from one form can't be replayed on another, and nobody can make up an older
 * time to skip the "too fast" check.
 */
export function checkRenderedAtToken(formId: string, token: string | null | undefined, now: number = Date.now()): TimestampCheck {
  if (!token) return "missing";
  const m = /^(\d{12,15})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!m) return "invalid";
  const ms = Number(m[1]);
  const given = Buffer.from(m[2]);
  const expected = Buffer.from(signTimestamp(formId, ms));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "invalid";
  const age = now - ms;
  // A little slack for a time in the "future" (several servers' clocks).
  if (age < -60_000) return "invalid";
  if (age < MIN_FILL_MS) return "too_fast";
  if (age > MAX_FILL_MS) return "expired";
  return "ok";
}

// ── Honeypot ───────────────────────────────────────────────────────────────

/** True when the invisible field has anything in it. */
export function honeypotFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

// ── Rate limits ────────────────────────────────────────────────────────────

// In-memory limiters (see lib/media/rate-limit.ts for why that's OK on one
// server and what to change with several). Kept on globalThis so they
// survive dev reloads.
//
// Per-IP limits rely on the X-Forwarded-For header from our reverse proxy.
// Without a proxy that overwrites it, a bot can fake it; the per-form and
// per-email limits still hold then.
type Limiter = ReturnType<typeof createRateLimiter>;
const store = globalThis as unknown as {
  klyveFormLimiters?: { burst: Limiter; ipForm: Limiter; form: Limiter; email: Limiter };
};
const limiters = (store.klyveFormLimiters ??= {
  // Any request from one IP to any form (also bad/invalid ones), so nobody
  // can hammer the database with junk.
  burst: createRateLimiter({ max: 30, windowMs: 60_000 }),
  // Sign-ups (real or spam) from one IP to one form: 5 per 10 minutes.
  ipForm: createRateLimiter({ max: 5, windowMs: 10 * 60_000 }),
  // All sign-ups to one form: about 300 an hour (a viral moment is fine,
  // a botnet isn't).
  form: createRateLimiter({ max: 300, windowMs: 60 * 60_000 }),
  // One email address, across all forms: 3 an hour. Stops someone using our
  // forms to flood a victim's inbox with confirmation emails (the opt-in
  // code has its own per-contact limit on top: lib/optin).
  email: createRateLimiter({ max: 3, windowMs: 60 * 60_000 }),
});

export type LimitCheck = { ok: true } | { ok: false; retryAfterSeconds: number };

const asCheck = (r: ReturnType<Limiter["hit"]>): LimitCheck => (r.ok ? { ok: true } : { ok: false, retryAfterSeconds: r.retryAfterSeconds });

/** Counts one request from this IP (any form, any outcome). */
export function hitBurstLimit(ip: string): LimitCheck {
  return asCheck(limiters.burst.hit(`burst:${ip}`));
}

/** Counts one sign-up attempt for this IP on this form, and for the form overall. */
export function hitSignupLimits(ip: string, formId: string): LimitCheck {
  const perIp = limiters.ipForm.hit(`ip:${formId}:${ip}`);
  if (!perIp.ok) return asCheck(perIp);
  return asCheck(limiters.form.hit(`form:${formId}`));
}

/**
 * Counts one sign-up for this (already normalised) address. The key is a
 * hash, so the limiter's memory never holds plain addresses.
 */
export function hitEmailLimit(email: string): LimitCheck {
  const key = createHash("sha256").update(`klyve-form-email:${email}`).digest("hex");
  return asCheck(limiters.email.hit(key));
}
