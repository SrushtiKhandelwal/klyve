import "server-only";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { PROVIDER_TYPES, type ProviderCredentials, type ProviderTypeValue } from "@/lib/email/provider-configs";
import type { ConnectionCheckResult, OutgoingEmail, SendResult } from "@/lib/email/types";
import { checkConnectionDetailed, sendEmailDetailed, validateCredentials, type CheckResultWithLimits } from "@/lib/email/send";
import { trimMessage, type Failure } from "@/lib/email/providers/shared";

// Sending through a provider SAVED in the database: load it (only within
// the given workspace), decrypt its credentials, send or test, and record
// the outcome in `status` / `lastError` so the settings page can show it.
//
// Status rules:
//  - success                         → CONNECTED, lastError cleared
//  - provider problem, not retryable → FAILED + lastError (wrong key, paused account, ...)
//  - temporary problem (rate limit)  → a CONNECTED provider stays CONNECTED
//  - a problem with ONE email (bad recipient) doesn't change the status

export type StoredProvider = {
  id: string;
  workspaceId: string;
  name: string;
  type: ProviderTypeValue;
  status: "UNTESTED" | "CONNECTED" | "FAILED";
  isDefault: boolean;
  maxPerSecond: number;
  dailyLimit: number | null;
};

/** Thrown by loadProvider when the saved credentials can't be decrypted or are invalid. */
export class ProviderCredentialsError extends Error {}

const PUBLIC_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  type: true,
  status: true,
  isDefault: true,
  maxPerSecond: true,
  dailyLimit: true,
} as const;

const NOT_FOUND = "This email provider doesn't exist (or belongs to another workspace).";
const UNREADABLE = "The saved credentials for this provider couldn't be read. Please edit the provider and enter them again.";

/**
 * Loads a provider and its decrypted credentials. Returns null if it doesn't
 * exist or belongs to another workspace. Throws ProviderCredentialsError if
 * the credentials can't be decrypted or don't match the provider's schema.
 */
export async function loadProvider(
  workspaceId: string,
  providerId: string,
): Promise<{ provider: StoredProvider; credentials: ProviderCredentials } | null> {
  const loaded = await loadRow(workspaceId, providerId);
  if (!loaded) return null;
  const credentials = decodeCredentials(loaded.row.type, loaded.encrypted);
  return { provider: loaded.row, credentials };
}

/** The workspace's default provider, or null if none is marked default. */
export async function getDefaultProvider(workspaceId: string): Promise<StoredProvider | null> {
  if (!workspaceId) return null;
  return db.sendingProvider.findFirst({
    where: { workspaceId, isDefault: true },
    select: PUBLIC_SELECT,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Sends one email through a saved provider and records the outcome.
 * Never throws. Called once per email in campaigns, so it only writes to
 * the database when the status actually changes.
 */
export async function sendWithStoredProvider(workspaceId: string, providerId: string, email: OutgoingEmail): Promise<SendResult> {
  const loaded = await safeLoad(workspaceId, providerId);
  if (!loaded.ok) return { ok: false, error: loaded.error, retryable: loaded.retryable };
  const { row, credentials, lastError } = loaded;

  const result = await sendEmailDetailed(credentials, email);

  if (result.ok) {
    if (row.status !== "CONNECTED" || lastError !== null) {
      await saveStatus(row, { status: "CONNECTED", lastError: null });
    }
    return { ok: true, providerMessageId: result.providerMessageId };
  }
  if (!result.retryable && result.providerIssue) {
    await saveStatus(row, { status: "FAILED", lastError: shortError(result.error) });
  }
  return { ok: false, error: result.error, retryable: result.retryable };
}

/** Tests a saved provider's connection and records status, lastTestedAt and lastError. Never throws. */
export async function testStoredProvider(workspaceId: string, providerId: string): Promise<CheckResultWithLimits> {
  const lastTestedAt = new Date();
  const loaded = await safeLoad(workspaceId, providerId, lastTestedAt);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { row, credentials } = loaded;

  const result = await checkConnectionDetailed(credentials);

  if (result.ok) {
    await saveStatus(row, { status: "CONNECTED", lastError: null, lastTestedAt });
    return { ok: true, detail: result.detail, limits: result.limits };
  }
  // A temporary problem (timeout, rate limit) doesn't prove a working
  // provider is broken: keep CONNECTED, but remember what happened.
  const keepConnected = result.retryable && row.status === "CONNECTED";
  await saveStatus(row, { status: keepConnected ? "CONNECTED" : "FAILED", lastError: shortError(result.error), lastTestedAt });
  return { ok: false, error: result.error } satisfies ConnectionCheckResult;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadRow(workspaceId: string, providerId: string) {
  if (typeof workspaceId !== "string" || typeof providerId !== "string" || !workspaceId || !providerId) return null;
  // Filtering by BOTH ids means a providerId from another workspace simply isn't found.
  const row = await db.sendingProvider.findFirst({
    where: { id: providerId, workspaceId },
    select: { ...PUBLIC_SELECT, credentials: true, lastError: true },
  });
  if (!row) return null;
  const { credentials: encrypted, lastError, ...publicRow } = row;
  return { row: publicRow as StoredProvider, encrypted, lastError };
}

/** Decrypts and validates stored credentials. Accepts `{ type, config }` (what we save) or a bare config. */
function decodeCredentials(type: ProviderTypeValue, encrypted: string): ProviderCredentials {
  if (!(PROVIDER_TYPES as readonly string[]).includes(type)) throw new ProviderCredentialsError(UNREADABLE);
  let decoded: unknown;
  try {
    decoded = decryptJson(encrypted);
  } catch {
    // Wrong/rotated ENCRYPTION_KEY or a corrupted value. Never include the error itself.
    throw new ProviderCredentialsError(UNREADABLE);
  }
  if (!decoded || typeof decoded !== "object") throw new ProviderCredentialsError(UNREADABLE);
  const obj = decoded as { type?: unknown; config?: unknown };
  if (obj.type !== undefined && obj.type !== type) throw new ProviderCredentialsError(UNREADABLE);
  const config = "config" in obj && obj.config && typeof obj.config === "object" ? obj.config : decoded;

  const valid = validateCredentials({ type, config } as ProviderCredentials);
  if (!valid.ok) throw new ProviderCredentialsError(valid.error);
  return valid.credentials;
}

type SafeLoad =
  | { ok: true; row: StoredProvider; credentials: ProviderCredentials; lastError: string | null }
  | (Failure & { ok: false });

/** loadProvider without throwing: unreadable credentials are recorded as FAILED. */
async function safeLoad(workspaceId: string, providerId: string, lastTestedAt?: Date): Promise<SafeLoad> {
  let loaded: Awaited<ReturnType<typeof loadRow>>;
  try {
    loaded = await loadRow(workspaceId, providerId);
  } catch {
    return { ok: false, error: "Couldn't load the email provider (database problem). Please try again.", retryable: true };
  }
  if (!loaded) return { ok: false, error: NOT_FOUND, retryable: false };
  try {
    const credentials = decodeCredentials(loaded.row.type, loaded.encrypted);
    return { ok: true, row: loaded.row, credentials, lastError: loaded.lastError };
  } catch (err) {
    const error = err instanceof ProviderCredentialsError ? err.message : UNREADABLE;
    await saveStatus(loaded.row, { status: "FAILED", lastError: shortError(error), ...(lastTestedAt ? { lastTestedAt } : {}) });
    return { ok: false, error, retryable: false, providerIssue: true };
  }
}

/**
 * Writes the status. A failure here must NOT turn a successful send into a
 * failed one (the email already went out; a retry would send it twice), so
 * errors are logged (without details that could hold secrets) and ignored.
 */
async function saveStatus(
  row: StoredProvider,
  data: { status: StoredProvider["status"]; lastError: string | null; lastTestedAt?: Date },
): Promise<void> {
  try {
    // updateMany lets us filter by workspace too, as a second safety check.
    await db.sendingProvider.updateMany({ where: { id: row.id, workspaceId: row.workspaceId }, data });
  } catch (err) {
    console.error(`[email] Couldn't save status for provider ${row.id}:`, err instanceof Error ? err.name : "unknown error");
  }
}

function shortError(error: string): string {
  return trimMessage(error, 300);
}
