import "server-only";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { hashApiKey } from "@/lib/api/keys";
import { authBlockedFor, recordAuthFailure, requestIp } from "@/lib/api/rate-limit";
import { apiError } from "@/lib/api/respond";
import { API_KEY_PATTERN } from "@/lib/transactional/schema";

// Who is calling the API? Reads the API key from the request and finds the
// workspace it belongs to.
//
// The key can be sent as
//     Authorization: Bearer klv_...      (preferred)
//     X-API-Key: klv_...                 (for tools that can't set Authorization)
//
// Security rules:
//  - Every failure (no key, malformed, unknown, revoked, workspace deleted)
//    gets the SAME 401 message, so nobody can learn whether a key exists.
//  - The format is checked before touching the database: garbage costs nothing.
//  - Keys are looked up by their SHA-256 hash (we never store the key).
//  - Too many bad keys from one IP → 429 for a minute (rate-limit.ts).
//  - The workspace must have an owner with a verified email address: the same
//    rule as for campaigns, so a throwaway sign-up can't send email.

export type ApiAuth = {
  workspace: { id: string; name: string };
  apiKey: { id: string; name: string; prefix: string };
};

export type AuthResult = ({ ok: true } & ApiAuth) | { ok: false; response: Response };

const UNAUTHORIZED_MESSAGE =
  'Missing or invalid API key. Send it as "Authorization: Bearer klv_..." (create one in Settings → API keys).';

/** Write lastUsedAt at most this often per key, not on every request. */
const LAST_USED_EVERY_MS = 60 * 1000;

/** The key from "Authorization: Bearer …" or "X-API-Key: …" (null if neither). */
function readKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    // A malformed Authorization header still counts as "a key was sent".
    return m ? m[1].trim() : auth.trim();
  }
  const header = request.headers.get("x-api-key");
  return header ? header.trim() : null;
}

/** Same answer for every kind of bad key. */
function unauthorized(): Response {
  return apiError("unauthorized", UNAUTHORIZED_MESSAGE, undefined, { "WWW-Authenticate": 'Bearer realm="klyve"' });
}

/** Equal-length hex hashes compared in constant time. */
function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/**
 * Checks the request's API key. On success: the workspace and key. On
 * failure: a ready-made 401 / 403 / 429 response to return as-is.
 */
export async function authenticate(request: Request): Promise<AuthResult> {
  const ip = requestIp(request.headers);
  const blockedFor = authBlockedFor(ip);
  if (blockedFor !== null) {
    return {
      ok: false,
      response: apiError("rate_limited", `Too many requests with an invalid API key. Try again in ${blockedFor} seconds.`, undefined, {
        "Retry-After": String(blockedFor),
      }),
    };
  }

  const key = readKey(request);
  // No key at all is a set-up mistake, not a guess: not counted for the IP limit.
  if (!key) return { ok: false, response: unauthorized() };

  const fail = (): AuthResult => {
    recordAuthFailure(ip);
    return { ok: false, response: unauthorized() };
  };
  if (!API_KEY_PATTERN.test(key)) return fail();

  const hash = hashApiKey(key);
  const row = await db.apiKey.findUnique({
    where: { keyHash: hash },
    select: {
      id: true,
      name: true,
      prefix: true,
      keyHash: true,
      revokedAt: true,
      lastUsedAt: true,
      workspace: {
        select: {
          id: true,
          name: true,
          // Just "is there at least one verified owner?"
          members: { where: { role: "OWNER", user: { emailVerified: true } }, select: { id: true }, take: 1 },
        },
      },
    },
  });
  // The lookup is by hash; the extra constant-time check is cheap belt and braces.
  if (!row || !sameHash(row.keyHash, hash) || row.revokedAt || !row.workspace) return fail();

  if (row.workspace.members.length === 0) {
    return {
      ok: false,
      response: apiError(
        "forbidden",
        "The owner of this workspace hasn't verified their email address yet. Verify it (we sent a link at sign-up) before using the API.",
      ),
    };
  }

  // "Last used" is only a hint for the dashboard, so it's written at most once
  // a minute per key, and without making the caller wait. The WHERE repeats
  // the check so several servers / parallel requests don't all write.
  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
    const cutoff = new Date(now - LAST_USED_EVERY_MS);
    db.apiKey
      .updateMany({
        where: { id: row.id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }] },
        data: { lastUsedAt: new Date(now) },
      })
      .catch((error: unknown) => console.error("[api] couldn't update lastUsedAt:", error));
  }

  return {
    ok: true,
    workspace: { id: row.workspace.id, name: row.workspace.name },
    apiKey: { id: row.id, name: row.name, prefix: row.prefix },
  };
}
