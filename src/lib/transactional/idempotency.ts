import "server-only";
import { createHash } from "node:crypto";
import { TRANSACTIONAL_LIMITS, type SendEmailInput } from "./schema";

// IDEMPOTENCY: "the same Idempotency-Key twice = the same email, sent once".
//
// A client that isn't sure its request arrived (timeout, crash) simply sends
// it again with the same key. We must then return the FIRST email instead of
// sending a second one, but only if the request is really the same: the same
// key with a DIFFERENT body is a bug on the caller's side → 409
// idempotency_conflict.
//
// HOW WE REMEMBER THE BODY
// The `idempotencyKey` column stores "<key>|<hash>", where <hash> is the
// first 16 hex characters of SHA-256 over the request, normalised (keys
// sorted, so {"a":1,"b":2} and {"b":2,"a":1} are the same request). We can't
// rebuild the request from the stored row (params aren't stored, the HTML is
// personalised and later cleared), and `metadata` belongs to the user, so the
// hash lives next to the key. The hash part has a fixed length, so the user's
// key is always "everything before the last 17 characters".
//
// RACES: two identical requests arriving at the same moment. The insert runs
// in a transaction holding a Postgres advisory lock on (workspace, key), so
// the second request waits, then finds the first one's row. The unique
// constraint on (workspaceId, idempotencyKey) is a second safety net.

const HASH_LENGTH = 16;
const SEPARATOR = "|";

/** The user's key: trimmed, 1–100 visible characters. null = no key; "invalid" = refuse. */
export function cleanIdempotencyKey(raw: string | null | undefined): string | null | "invalid" {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return "invalid";
  const key = raw.trim();
  if (!key) return null;
  if (key.length > TRANSACTIONAL_LIMITS.idempotencyKeyMax || /[\u0000-\u001f\u007f]/.test(key)) return "invalid";
  return key;
}

/** JSON with object keys sorted at every level, so the order of fields doesn't matter. */
function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** 16 hex characters identifying this request's content (after validation/normalisation). */
export function requestHash(input: SendEmailInput): string {
  return createHash("sha256").update(stableStringify(input), "utf8").digest("hex").slice(0, HASH_LENGTH);
}

/** What we store in the column. */
export function storedIdempotencyKey(key: string, hash: string): string {
  return `${key}${SEPARATOR}${hash}`;
}

/** Splits a stored value back into the user's key and the hash. */
export function splitStoredKey(stored: string): { key: string; hash: string } | null {
  const cut = stored.length - HASH_LENGTH - SEPARATOR.length;
  if (cut <= 0 || stored[cut] !== SEPARATOR) return null;
  return { key: stored.slice(0, cut), hash: stored.slice(cut + 1) };
}

/** The key as the caller sent it (for display). */
export function userIdempotencyKey(stored: string): string {
  return splitStoredKey(stored)?.key ?? stored;
}
