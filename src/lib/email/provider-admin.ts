import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  parseProviderCredentials,
  PROVIDER_TYPES,
  PROVIDERS,
  type ProviderCredentials,
  type ProviderTypeValue,
} from "@/lib/email/provider-configs";
import type { OutgoingEmail } from "@/lib/email/types";
import { providerSettingsSchema, TEST_EMAILS_PER_HOUR } from "@/components/settings/providers/provider-rules";

// Data access for the "Sending providers" settings page.
//
// SECURITY RULES:
// - Every function takes the workspace id from the CALLER (which must get it
//   from requireActiveWorkspace(), never from the browser) and filters every
//   query by it. A provider id from another workspace is simply "not found".
// - The encrypted `credentials` column is only ever read inside this file, to
//   merge changes on edit. It is NEVER part of anything these functions
//   return. Only the safe `credentialsHint` (e.g. "••••a1b2") leaves.
// - Role checks (OWNER/ADMIN may change providers) live in the Server Actions.

/** Columns that are safe to send to the browser. Note: no `credentials`. */
const SAFE_SELECT = {
  id: true,
  name: true,
  type: true,
  credentialsHint: true,
  status: true,
  lastTestedAt: true,
  lastError: true,
  isDefault: true,
  maxPerSecond: true,
  dailyLimit: true,
  createdAt: true,
  _count: { select: { senders: true } },
} satisfies Prisma.SendingProviderSelect;

type SafeRow = Prisma.SendingProviderGetPayload<{ select: typeof SAFE_SELECT }>;

export type ProviderStatusValue = "UNTESTED" | "CONNECTED" | "FAILED";

/** One provider as shown in the UI. Contains no secrets. */
export type ProviderSummary = {
  id: string;
  name: string;
  type: ProviderTypeValue;
  hint: Record<string, string>;
  status: ProviderStatusValue;
  lastTestedAt: Date | null;
  lastError: string | null;
  isDefault: boolean;
  maxPerSecond: number;
  dailyLimit: number | null;
  createdAt: Date;
  senderCount: number;
};

/** Values for the edit form: everything except secret fields. */
export type ProviderForEdit = ProviderSummary & {
  values: Record<string, string | boolean>;
  /** True if the stored credentials could not be decrypted (e.g. the key changed). */
  credentialsUnreadable: boolean;
};

/** What the add/edit form sends (already plain values, still untrusted). */
export type ProviderInput = {
  name: unknown;
  maxPerSecond: unknown;
  dailyLimit: unknown;
  /** Raw values for PROVIDERS[type].fields, keyed by field name. */
  config: unknown;
};

export type FieldErrors = Record<string, string[]>;

export type SaveProviderResult =
  | { ok: true; providerId: string }
  | { ok: false; errors?: FieldErrors; message?: string };

function toSummary(row: SafeRow): ProviderSummary {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ProviderTypeValue,
    hint: toStringRecord(row.credentialsHint),
    status: row.status,
    lastTestedAt: row.lastTestedAt,
    lastError: row.lastError,
    isDefault: row.isDefault,
    maxPerSecond: row.maxPerSecond,
    dailyLimit: row.dailyLimit,
    createdAt: row.createdAt,
    senderCount: row._count.senders,
  };
}

/** The hint is JSON in the database; we only pass on plain string values. */
function toStringRecord(json: Prisma.JsonValue): Record<string, string> {
  const out: Record<string, string> = {};
  if (json && typeof json === "object" && !Array.isArray(json)) {
    for (const [key, value] of Object.entries(json)) {
      if (typeof value === "string") out[key] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** All providers of the workspace, default first, then oldest first. */
export async function listProviders(workspaceId: string): Promise<ProviderSummary[]> {
  const rows = await db.sendingProvider.findMany({
    where: { workspaceId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    select: SAFE_SELECT,
  });
  return rows.map(toSummary);
}

/** One provider (safe fields only), or null if it isn't in this workspace. */
export async function getProviderSummary(workspaceId: string, providerId: string): Promise<ProviderSummary | null> {
  const row = await db.sendingProvider.findFirst({ where: { id: providerId, workspaceId }, select: SAFE_SELECT });
  return row ? toSummary(row) : null;
}

/**
 * A provider plus its NON-secret settings (host, port, region...) so the edit
 * form can be prefilled. Secret fields (passwords, API keys) are left out on
 * purpose: the form shows them empty with "Leave blank to keep the current value".
 */
export async function getProviderForEdit(workspaceId: string, providerId: string): Promise<ProviderForEdit | null> {
  const row = await db.sendingProvider.findFirst({
    where: { id: providerId, workspaceId },
    select: { ...SAFE_SELECT, credentials: true },
  });
  if (!row) return null;

  const { credentials, ...safe } = row;
  const summary = toSummary(safe);
  const stored = readStoredConfig(credentials);

  const values: Record<string, string | boolean> = {};
  for (const field of PROVIDERS[summary.type].fields) {
    if (field.secret) continue; // never prefill (or send) secrets
    const value = stored?.[field.name];
    if (field.kind === "checkbox") values[field.name] = value === true;
    else if (typeof value === "string" || typeof value === "number") values[field.name] = String(value);
    else values[field.name] = "";
  }

  return { ...summary, values, credentialsUnreadable: stored === null };
}

/** Decrypts the stored config, or null if that fails. Stays inside this file. */
function readStoredConfig(encrypted: string): Record<string, unknown> | null {
  try {
    const parsed = decryptJson<ProviderCredentials>(encrypted);
    return parsed && typeof parsed.config === "object" ? (parsed.config as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Validation (shared by create and edit)
// ---------------------------------------------------------------------------

type ValidatedInput = {
  name: string;
  maxPerSecond: number;
  dailyLimit: number | null;
  credentials: ProviderCredentials;
};

/**
 * Turns raw form values into typed credentials for `type`.
 * `previous` = the currently stored config (edit only): a blank secret field
 * keeps its old value, so people don't have to re-type their password.
 */
function validateInput(
  type: ProviderTypeValue,
  input: ProviderInput,
  previous: Record<string, unknown> | null,
): { ok: true; data: ValidatedInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const settings = providerSettingsSchema.safeParse({
    name: typeof input.name === "string" ? input.name : "",
    maxPerSecond: input.maxPerSecond,
    dailyLimit: input.dailyLimit,
  });
  if (!settings.success) Object.assign(errors, z.flattenError(settings.error).fieldErrors);

  const config = input.config && typeof input.config === "object" ? (input.config as Record<string, unknown>) : {};
  const raw: Record<string, unknown> = {};
  const blank = new Set<string>();

  // Only look at the fields this provider defines; anything else is ignored.
  for (const field of PROVIDERS[type].fields) {
    const value = config[field.name];
    if (field.kind === "checkbox") {
      // Real booleans only: z.coerce.boolean() would turn the string "false" into true.
      raw[field.name] = value === true || value === "true" || value === "on";
      continue;
    }
    const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    if (text === "") {
      if (field.secret && previous && typeof previous[field.name] === "string") {
        raw[field.name] = previous[field.name]; // keep the current secret
      } else {
        blank.add(field.name);
        // Undefined lets schema defaults apply (e.g. Postmark's "broadcast")
        // and optional fields stay empty.
        raw[field.name] = undefined;
      }
    } else {
      raw[field.name] = text;
    }
  }

  const parsed = parseProviderCredentials(type, raw);
  if (!parsed.ok) {
    for (const [name, messages] of Object.entries(parsed.errors)) {
      const field = PROVIDERS[type].fields.find((f) => f.name === name);
      // Zod's message for a missing value is technical, so say it plainly.
      errors[`config.${name}`] = field && blank.has(name) ? [`${field.label} is required.`] : messages;
    }
  }

  if (!settings.success || !parsed.ok) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name: settings.data.name,
      maxPerSecond: settings.data.maxPerSecond,
      dailyLimit: settings.data.dailyLimit,
      credentials: parsed.credentials,
    },
  };
}

export function isProviderType(value: unknown): value is ProviderTypeValue {
  return typeof value === "string" && (PROVIDER_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

/**
 * Makes changes to the workspace's providers one at a time. Without this, two
 * requests at the same moment (say, two "first provider" saves) could each
 * think "there's no default yet" and we'd end up with two defaults.
 * The lock is released automatically when the transaction ends.
 */
async function lockWorkspaceProviders(tx: Tx, workspaceId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"sending_provider:" + workspaceId}))`;
}

function isUniqueClash(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function duplicateName(name: string): SaveProviderResult {
  return { ok: false, errors: { name: [`You already have a provider called "${name}". Please pick another name.`] } };
}

/** The database blocks exact duplicates; we also block "Gmail" vs "gmail". */
async function findNameClash(workspaceId: string, name: string, exceptId?: string) {
  return db.sendingProvider.findFirst({
    where: {
      workspaceId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
}

/**
 * Validates, encrypts and saves a new provider. The first provider of a
 * workspace automatically becomes its default. Status starts as UNTESTED;
 * the caller runs the connection test right after.
 */
export async function createProvider(
  workspaceId: string,
  type: unknown,
  input: ProviderInput,
): Promise<SaveProviderResult> {
  if (!isProviderType(type)) return { ok: false, message: "Please choose a provider type." };

  const result = validateInput(type, input, null);
  if (!result.ok) return { ok: false, errors: result.errors };
  const { name, maxPerSecond, dailyLimit, credentials } = result.data;

  const clash = await findNameClash(workspaceId, name);
  if (clash) return duplicateName(clash.name);

  try {
    const created = await db.$transaction(async (tx) => {
      await lockWorkspaceProviders(tx, workspaceId);
      const hasDefault = await tx.sendingProvider.count({ where: { workspaceId, isDefault: true } });
      return tx.sendingProvider.create({
        data: {
          workspaceId,
          name,
          type,
          credentials: encryptJson(credentials),
          credentialsHint: PROVIDERS[type].hint(credentials.config),
          maxPerSecond,
          dailyLimit,
          isDefault: hasDefault === 0,
        },
        select: { id: true },
      });
    });
    return { ok: true, providerId: created.id };
  } catch (error) {
    if (isUniqueClash(error)) return duplicateName(name);
    throw error;
  }
}

/**
 * Saves changes to a provider. The type can't change. Blank secret fields keep
 * their stored value: we decrypt the old config, lay the new values over it,
 * validate the result and encrypt it again.
 */
export async function updateProvider(
  workspaceId: string,
  providerId: string,
  input: ProviderInput,
): Promise<SaveProviderResult> {
  const existing = await db.sendingProvider.findFirst({
    where: { id: providerId, workspaceId },
    select: { id: true, type: true, credentials: true },
  });
  if (!existing) return { ok: false, message: "This provider no longer exists." };

  const type = existing.type as ProviderTypeValue;
  const previous = readStoredConfig(existing.credentials);
  const result = validateInput(type, input, previous);
  if (!result.ok) return { ok: false, errors: result.errors };
  const { name, maxPerSecond, dailyLimit, credentials } = result.data;

  const clash = await findNameClash(workspaceId, name, providerId);
  if (clash) return duplicateName(clash.name);

  try {
    // updateMany with BOTH ids: a provider from another workspace can never match.
    const { count } = await db.sendingProvider.updateMany({
      where: { id: providerId, workspaceId },
      data: {
        name,
        credentials: encryptJson(credentials),
        credentialsHint: PROVIDERS[type].hint(credentials.config),
        maxPerSecond,
        dailyLimit,
        // The settings changed, so the old test result no longer applies.
        status: "UNTESTED",
        lastError: null,
      },
    });
    if (count === 0) return { ok: false, message: "This provider no longer exists." };
    return { ok: true, providerId };
  } catch (error) {
    if (isUniqueClash(error)) return duplicateName(name);
    throw error;
  }
}

/**
 * Deletes a provider. Senders that used it keep existing but lose their
 * provider (the database sets it to null). If it was the default, the oldest
 * remaining provider becomes the new default.
 */
export async function deleteProvider(
  workspaceId: string,
  providerId: string,
): Promise<{ ok: true; newDefault: { id: string; name: string } | null } | { ok: false }> {
  return db.$transaction(async (tx) => {
    await lockWorkspaceProviders(tx, workspaceId);
    const target = await tx.sendingProvider.findFirst({
      where: { id: providerId, workspaceId },
      select: { id: true, isDefault: true },
    });
    if (!target) return { ok: false } as const;

    await tx.sendingProvider.deleteMany({ where: { id: target.id, workspaceId } });

    let newDefault: { id: string; name: string } | null = null;
    if (target.isDefault) {
      newDefault = await tx.sendingProvider.findFirst({
        where: { workspaceId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true },
      });
      if (newDefault) {
        await tx.sendingProvider.updateMany({ where: { id: newDefault.id, workspaceId }, data: { isDefault: true } });
      }
    }
    return { ok: true, newDefault } as const;
  });
}

/** Makes one provider the default; every other provider of the workspace stops being it. */
export async function setDefaultProvider(workspaceId: string, providerId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await lockWorkspaceProviders(tx, workspaceId);
    const target = await tx.sendingProvider.findFirst({ where: { id: providerId, workspaceId }, select: { id: true } });
    if (!target) return false;

    await tx.sendingProvider.updateMany({
      where: { workspaceId, isDefault: true, id: { not: target.id } },
      data: { isDefault: false },
    });
    await tx.sendingProvider.updateMany({ where: { id: target.id, workspaceId }, data: { isDefault: true } });
    return true;
  });
}

/**
 * Marks a provider as failed with a reason. Used only as a fallback when the
 * connection test itself crashes (normally the test records its own result).
 */
export async function markProviderFailed(workspaceId: string, providerId: string, error: string) {
  await db.sendingProvider.updateMany({
    where: { id: providerId, workspaceId },
    data: { status: "FAILED", lastError: error.slice(0, 1000), lastTestedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Test emails
// ---------------------------------------------------------------------------

/*
 * Rate limit: at most TEST_EMAILS_PER_HOUR test emails per provider per hour.
 *
 * This is a simple in-memory "sliding window": we remember when each test
 * email was sent and count the ones from the last hour. It lives on
 * `globalThis` so it survives hot reloads in development.
 * Limitations (fine for now): it resets when the server restarts, and if we
 * ever run several server instances, each one counts separately. A shared
 * store (database table or Redis) would fix that later.
 */
const HOUR_MS = 60 * 60 * 1000;
const globalForLimits = globalThis as unknown as { providerTestEmailLog?: Map<string, number[]> };
const testEmailLog = (globalForLimits.providerTestEmailLog ??= new Map<string, number[]>());

/** Reserves one test-email slot. Returns how many minutes to wait if none is left. */
export function takeTestEmailSlot(
  workspaceId: string,
  providerId: string,
  now = Date.now(),
): { ok: true } | { ok: false; retryInMinutes: number } {
  const key = `${workspaceId}:${providerId}`;
  const recent = (testEmailLog.get(key) ?? []).filter((t) => now - t < HOUR_MS);
  if (recent.length >= TEST_EMAILS_PER_HOUR) {
    testEmailLog.set(key, recent);
    return { ok: false, retryInMinutes: Math.max(1, Math.ceil((recent[0] + HOUR_MS - now) / 60_000)) };
  }
  recent.push(now);
  testEmailLog.set(key, recent);
  return { ok: true };
}

/** Builds the small "it works!" email sent by "Send test email". */
export function buildTestEmail({
  providerName,
  providerType,
  to,
  from,
  now = new Date(),
}: {
  providerName: string;
  providerType: ProviderTypeValue;
  to: string;
  from: string;
  now?: Date;
}): OutgoingEmail {
  const typeLabel = PROVIDERS[providerType].label;
  const time = `${now.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
  const subject = `Your MailFlow sending provider "${providerName}" works`;
  // The provider name is typed by users, so escape it before putting it in HTML.
  const safeName = escapeHtml(providerName);

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:12px;font-weight:600;">Test email</div>
          <h1 style="margin:16px 0 8px;font-size:20px;line-height:1.3;">It works! 🎉</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">
            Your sending provider <strong>&ldquo;${safeName}&rdquo;</strong> delivered this email, so MailFlow can send your campaigns through it.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#3f3f46;background:#fafafa;border-radius:8px;">
            <tr><td style="padding:10px 14px;color:#71717a;width:110px;">Provider</td><td style="padding:10px 14px;">${safeName}</td></tr>
            <tr><td style="padding:10px 14px;color:#71717a;">Type</td><td style="padding:10px 14px;">${escapeHtml(typeLabel)}</td></tr>
            <tr><td style="padding:10px 14px;color:#71717a;">Sent at</td><td style="padding:10px 14px;">${time}</td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;">
          You received this because someone clicked &ldquo;Send test email&rdquo; in MailFlow.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "It works!",
    "",
    `Your sending provider "${providerName}" delivered this email, so MailFlow can send your campaigns through it.`,
    "",
    `Provider: ${providerName}`,
    `Type: ${typeLabel}`,
    `Sent at: ${time}`,
    "",
    'You received this because someone clicked "Send test email" in MailFlow.',
  ].join("\n");

  return {
    from: { email: from, name: "MailFlow test" },
    to: { email: to },
    subject,
    html,
    text,
    tags: { kind: "provider-test" },
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
