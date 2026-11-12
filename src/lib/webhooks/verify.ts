import "server-only";
import { createHash, createHmac, timingSafeEqual, verify as cryptoVerify } from "node:crypto";
import { parseSendgridPublicKey } from "./secrets";

// Signature checks for each provider's webhooks. They all answer true/false
// and never throw, so a malformed header just means "not verified".
//
// "Constant-time" comparisons: a normal `a === b` stops at the first wrong
// character, and an attacker could measure that tiny delay to guess a
// signature one character at a time. timingSafeEqual always takes as long.

/** Compares two strings in constant time (hashing first makes the lengths equal). */
export function safeEqualString(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** Svix allows 5 minutes of clock difference; older messages may be replays. */
const SVIX_TOLERANCE_SECONDS = 5 * 60;

/**
 * Resend signs webhooks with Svix: HMAC-SHA256 over "id.timestamp.body",
 * keyed with the base64 part of "whsec_…". The header can hold several
 * signatures ("v1,abc v1,def") while a secret is being rotated.
 */
export function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now: Date = new Date(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > SVIX_TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`, "utf8").digest();

  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/**
 * SendGrid's Signed Event Webhook: an ECDSA (P-256, SHA-256) signature of
 * "timestamp + raw body", checked with the public key the user pasted.
 * The signature header is base64 of a DER-encoded signature.
 */
export function verifySendgrid(
  publicKey: string,
  headers: { signature: string | null; timestamp: string | null },
  rawBody: Buffer,
): boolean {
  const { signature, timestamp } = headers;
  if (!signature || !timestamp || timestamp.length > 32) return false;
  try {
    const key = parseSendgridPublicKey(publicKey);
    const payload = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);
    return cryptoVerify("sha256", payload, { key, dsaEncoding: "der" }, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

/**
 * Mailgun puts { timestamp, token, signature } in the JSON body. The
 * signature is hex HMAC-SHA256 of timestamp + token with the signing key.
 */
export function verifyMailgun(signingKey: string, sig: unknown): boolean {
  if (!sig || typeof sig !== "object") return false;
  const { timestamp, token, signature } = sig as Record<string, unknown>;
  if (typeof timestamp !== "string" && typeof timestamp !== "number") return false;
  if (typeof token !== "string" || typeof signature !== "string" || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", signingKey).update(`${timestamp}${token}`, "utf8").digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Postmark's optional HTTP Basic auth: "Authorization: Basic base64(user:pass)". */
export function verifyBasicAuth(header: string | null, username: string, password: string): boolean {
  const match = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)\s*$/i);
  if (!match) return false;
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  // Compare the whole "user:pass" string at once, in constant time.
  return safeEqualString(decoded, `${username}:${password}`);
}
