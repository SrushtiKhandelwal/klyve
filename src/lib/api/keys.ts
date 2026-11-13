import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { API_KEY_PREFIX, TRANSACTIONAL_LIMITS } from "@/lib/transactional/schema";

// API keys: the secret a workspace's own app sends to call /api/v1/*.
//
// How keys are kept safe:
//  - A key is "klv_" + 40 random letters/digits (~238 bits of randomness),
//    far too many to guess.
//  - We store only its SHA-256 hash. A leaked database can't be used to call
//    the API, and nobody (not even us) can show the key again: it's displayed
//    ONCE, right after creation. A plain fast hash is fine here (unlike for
//    passwords) because the key is long and random, not chosen by a human.
//  - We also keep the first 10 characters ("klv_3fA9x2") so people can tell
//    their keys apart in the dashboard.
//
// Every function takes a workspace id. ONLY pass the id from
// requireActiveWorkspace(), never one sent by the browser.

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const KEY_BODY_LENGTH = 40;
/** How many characters of the key we keep in clear, to recognise it. */
export const API_KEY_VISIBLE_CHARS = 10;
export const API_KEY_NAME_MAX = 60;

/**
 * 40 random base62 characters, without "modulo bias": a random byte is 0–255,
 * and 256 isn't a multiple of 62, so `byte % 62` would pick the first few
 * letters slightly more often. We only use bytes below 248 (= 4 × 62) and
 * throw the rest away, so every character is exactly equally likely.
 */
function randomBase62(length: number): string {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248) out += BASE62[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

/** SHA-256 (hex) of a full key: what we store and look keys up by. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** "  My   server " → "My server". Control characters removed. */
function cleanName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Give the key a name." };
  const name = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Give the key a name (e.g. \"Production server\")." };
  if (name.length > API_KEY_NAME_MAX) return { ok: false, error: `Keep the name under ${API_KEY_NAME_MAX} characters.` };
  return { ok: true, name };
}

// ── Create ──────────────────────────────────────────────────────────────────

export type CreateApiKeyResult =
  | {
      ok: true;
      id: string;
      /** The full key. Show it ONCE; it can never be read back. */
      key: string;
      prefix: string;
    }
  | { ok: false; error: string };

/**
 * Creates a new key. The caller must already have checked that the user may
 * manage keys in this workspace. At most TRANSACTIONAL_LIMITS.keysPerWorkspace
 * active (not revoked) keys per workspace.
 */
export async function createApiKey(ws: { id: string }, userId: string | null, rawName: unknown): Promise<CreateApiKeyResult> {
  const name = cleanName(rawName);
  if (!name.ok) return name;

  const active = await db.apiKey.count({ where: { workspaceId: ws.id, revokedAt: null } });
  if (active >= TRANSACTIONAL_LIMITS.keysPerWorkspace) {
    return {
      ok: false,
      error: `You already have ${TRANSACTIONAL_LIMITS.keysPerWorkspace} active keys. Revoke one you no longer use first.`,
    };
  }

  const key = API_KEY_PREFIX + randomBase62(KEY_BODY_LENGTH);
  const prefix = key.slice(0, API_KEY_VISIBLE_CHARS);
  const row = await db.apiKey.create({
    data: { workspaceId: ws.id, name: name.name, prefix, keyHash: hashApiKey(key), createdById: userId },
    select: { id: true },
  });
  return { ok: true, id: row.id, key, prefix };
}

// ── List ────────────────────────────────────────────────────────────────────

export type ApiKeySummary = {
  id: string;
  name: string;
  /** e.g. "klv_3fA9x2": the first characters, to recognise the key. */
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  /** Name of the team member who created it (null if they left / unknown). */
  createdByName: string | null;
  /** Emails sent with this key in the last 30 days. */
  emailsLast30Days: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The workspace's keys: active ones first, newest first. Never includes the hash. */
export async function listApiKeys(workspaceId: string): Promise<ApiKeySummary[]> {
  const keys = await db.apiKey.findMany({
    where: { workspaceId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true, createdById: true },
  });
  if (keys.length === 0) return [];

  const userIds = [...new Set(keys.map((k) => k.createdById).filter((id): id is string => !!id))];
  const [users, counts] = await Promise.all([
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
    db.transactionalEmail.groupBy({
      by: ["apiKeyId"],
      where: { workspaceId, apiKeyId: { in: keys.map((k) => k.id) }, createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) } },
      _count: { _all: true },
    }),
  ]);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const countOf = new Map(counts.map((c) => [c.apiKeyId, c._count._all]));

  return keys
    .map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
      createdByName: (k.createdById && nameOf.get(k.createdById)) || null,
      emailsLast30Days: countOf.get(k.id) ?? 0,
    }))
    // Active keys first; the sort is stable, so each group stays newest first.
    .sort((a, b) => Number(a.revokedAt !== null) - Number(b.revokedAt !== null));
}

// ── Revoke / rename ─────────────────────────────────────────────────────────

export type SimpleKeyResult = { ok: true } | { ok: false; error: string };

const NOT_FOUND: SimpleKeyResult = { ok: false, error: "This key doesn't exist (or was deleted)." };

/**
 * Revokes a key: from now on every request with it gets 401. Can't be undone
 * (create a new key instead). Revoking an already revoked key is fine.
 */
export async function revokeApiKey(workspaceId: string, id: string): Promise<SimpleKeyResult> {
  if (typeof id !== "string" || !id) return NOT_FOUND;
  const changed = await db.apiKey.updateMany({ where: { id, workspaceId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (changed.count > 0) return { ok: true };
  // Nothing changed: already revoked (fine), or not this workspace's key.
  const exists = await db.apiKey.count({ where: { id, workspaceId } });
  return exists ? { ok: true } : NOT_FOUND;
}

/** Renames a key (the key itself doesn't change). */
export async function renameApiKey(workspaceId: string, id: string, rawName: unknown): Promise<SimpleKeyResult> {
  if (typeof id !== "string" || !id) return NOT_FOUND;
  const name = cleanName(rawName);
  if (!name.ok) return name;
  const changed = await db.apiKey.updateMany({ where: { id, workspaceId }, data: { name: name.name } });
  return changed.count > 0 ? { ok: true } : NOT_FOUND;
}
