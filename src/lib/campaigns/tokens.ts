import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Signed tokens that identify ONE campaign recipient in a public link, e.g.
//   https://app/u/<token>   → unsubscribe page
//
// Why signed? The link must work without logging in, but nobody should be
// able to guess or forge one to unsubscribe someone else. The token is the
// recipient id plus an HMAC signature made with a server secret:
//   <recipientId>.<signature>
// Changing either part makes verification fail. No database lookup is
// needed to check the signature, and nothing extra is stored.

/**
 * "unsubscribe" → /u and /api/unsubscribe, "view" → /v (view in browser),
 * "track" → /t/o (open pixel) and /t/c (tracked link clicks).
 */
export type TokenPurpose = "unsubscribe" | "view" | "track";

function secret(purpose: TokenPurpose): Buffer {
  const base = process.env.ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;
  if (!base) throw new Error("ENCRYPTION_KEY is not set (see .env.example).");
  // A separate key per purpose: an unsubscribe token can't be used as a view token.
  return createHash("sha256").update(`klyve-recipient-token:${purpose}:${base}`).digest();
}

function sign(purpose: TokenPurpose, recipientId: string): string {
  return createHmac("sha256", secret(purpose)).update(recipientId).digest("base64url").slice(0, 32);
}

/** Token for a recipient, safe to put in a URL. */
export function createRecipientToken(recipientId: string, purpose: TokenPurpose = "unsubscribe"): string {
  return `${recipientId}.${sign(purpose, recipientId)}`;
}

/** Returns the recipient id if the token is genuine, otherwise null. */
export function verifyRecipientToken(token: string, purpose: TokenPurpose = "unsubscribe"): string | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const recipientId = token.slice(0, dot);
  if (!/^[a-z0-9]{10,40}$/i.test(recipientId)) return null;
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(purpose, recipientId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? recipientId : null;
}
