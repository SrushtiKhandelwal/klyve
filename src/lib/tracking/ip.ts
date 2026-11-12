import "server-only";
import { createHash } from "node:crypto";

// IP addresses are personal data, so we never store them. For tracking we
// only need to answer "is this the same request again?" (dedupe) and "where
// did it come from?" (bot checks, done in memory on the raw IP). So:
//
//   hashIp(ip) = sha256(secret + ip), shortened
//
// The secret comes from ENCRYPTION_KEY, so a leaked database can't be turned
// back into IPs by hashing all 4 billion IPv4 addresses (without the key).

let cachedSecret: string | null | undefined;

function secret(): string | null {
  if (cachedSecret !== undefined) return cachedSecret;
  const base = process.env.ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;
  // Derived (not the key itself), and labelled, so it can't be confused with
  // the key used for encryption or for signed tokens.
  cachedSecret = base ? createHash("sha256").update(`klyve-ip-hash:${base}`).digest("hex") : null;
  return cachedSecret;
}

/**
 * Cleans up an IP from a header: trims it, lowercases it and turns an
 * "IPv4 inside IPv6" form (::ffff:1.2.3.4) into plain 1.2.3.4.
 * Returns null for anything that isn't plausibly an IP.
 */
export function normalizeIp(ip: string | null | undefined): string | null {
  if (typeof ip !== "string") return null;
  let v = ip.trim().toLowerCase();
  if (!v || v === "unknown" || v.length > 45) return null;
  if (v.startsWith("::ffff:") && v.includes(".")) v = v.slice(7);
  return /^[0-9a-f:.]+$/.test(v) ? v : null;
}

/** sha256(secret + ip), 32 hex characters. null when there's no usable IP (or no secret). */
export function hashIp(ip: string | null | undefined): string | null {
  const clean = normalizeIp(ip);
  const s = secret();
  if (!clean || !s) return null;
  return createHash("sha256").update(s).update(clean).digest("hex").slice(0, 32);
}

/** "17.58.1.2" → a 32-bit number, or null if it isn't an IPv4 address. */
export function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const byte = Number(part);
    if (byte > 255) return null;
    n = n * 256 + byte;
  }
  return n;
}

/** True when an IPv4 address is inside a range like "17.0.0.0/8". */
export function ipv4InRange(ip: string | null | undefined, cidr: string): boolean {
  const clean = normalizeIp(ip);
  if (!clean) return false;
  const [base, bitsText] = cidr.split("/");
  const n = ipv4ToNumber(clean);
  const b = ipv4ToNumber(base);
  const bits = Number(bitsText);
  if (n === null || b === null || !(bits >= 0 && bits <= 32)) return false;
  if (bits === 0) return true;
  // Compare only the first `bits` bits (division keeps it in safe integer maths).
  const size = 2 ** (32 - bits);
  return Math.floor(n / size) === Math.floor(b / size);
}
