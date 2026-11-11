import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Encrypts secrets (like users' SMTP passwords and API keys) before they go
// into the database, using AES-256-GCM. GCM also detects tampering: a
// changed ciphertext fails to decrypt instead of returning garbage.
//
// Stored format (one string): "v1:<iv>:<authTag>:<ciphertext>", all base64.
// The "v1" lets us rotate to a new key/algorithm later without breaking old rows.

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set (see .env.example).");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return key;
}

export function encryptString(plain: string): string {
  const iv = randomBytes(12); // a fresh random IV every time, never reused
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptString(stored: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognised encrypted value.");
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function encryptJson(value: unknown): string {
  return encryptString(JSON.stringify(value));
}

export function decryptJson<T = unknown>(stored: string): T {
  return JSON.parse(decryptString(stored)) as T;
}

/** SHA-256 hex, for things like one-time codes (we store only the hash). */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Compares two hex hashes in constant time (avoids timing attacks). */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** "sk_live_abcd1234" → "••••1234". For showing a secret without revealing it. */
export function maskSecret(secret: string, visible = 4): string {
  if (!secret) return "";
  return `••••${secret.slice(-visible)}`;
}
