import "server-only";
import { randomBytes } from "node:crypto";
import { absoluteUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import type { ProviderTypeValue } from "@/lib/email/provider-configs";
import {
  encryptWebhookSecret,
  hasWebhookSecret,
  mergeWebhookSecret,
  readWebhookSecret,
  type SecretFieldErrors,
  type SecretInput,
} from "./secrets";
import { isWebhookProviderType } from "./setup-guide";

// Settings-side helpers for a provider's webhook (turn on/off, regenerate the
// URL, save the signing secret). Every function takes the workspaceId from
// the session and filters by it, so one workspace can never change another's.

/** What the settings card needs. Never contains the signing secret itself. */
export type WebhookSettings = {
  type: ProviderTypeValue;
  enabled: boolean;
  /** Full webhook URL (contains the secret token: only shown to owners/admins). */
  url: string | null;
  lastWebhookAt: string | null;
  secretSet: boolean;
  /** A secret is stored but can't be decrypted (encryption key changed). */
  secretUnreadable: boolean;
  /** SES only: the SNS topic this URL is locked to (not a secret). */
  topicArn: string | null;
  /** Postmark only: the Basic auth username (not a secret; the password is). */
  basicUsername: string | null;
};

/** 32 random bytes → 43 URL-safe characters. Impossible to guess. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function webhookUrl(providerId: string, token: string): string {
  return absoluteUrl(`/api/webhooks/${providerId}/${token}`);
}

export async function getWebhookSettings(workspaceId: string, providerId: string): Promise<WebhookSettings | null> {
  const p = await db.sendingProvider.findFirst({
    where: { id: providerId, workspaceId },
    select: { id: true, type: true, webhookToken: true, webhookSecret: true, lastWebhookAt: true },
  });
  if (!p) return null;
  const secret = readWebhookSecret(p.webhookSecret);
  // SMTP can't have webhooks: never hand a URL to the browser for it.
  const token = p.type === "SMTP" ? null : p.webhookToken;
  return {
    type: p.type,
    enabled: !!token,
    url: token ? webhookUrl(p.id, token) : null,
    lastWebhookAt: p.lastWebhookAt?.toISOString() ?? null,
    secretSet: isWebhookProviderType(p.type) && hasWebhookSecret(p.type, secret),
    secretUnreadable: !!p.webhookSecret && !secret,
    topicArn: p.type === "AMAZON_SES" ? (secret?.topicArn ?? null) : null,
    basicUsername: p.type === "POSTMARK" ? (secret?.username ?? null) : null,
  };
}

type Simple = { ok: true } | { ok: false; error: string };

const NOT_FOUND = "This provider no longer exists.";
const NO_SMTP = "SMTP servers can't report bounces automatically.";

/** The provider, only if it belongs to this workspace. */
function findApiProvider(workspaceId: string, providerId: string) {
  return db.sendingProvider.findFirst({
    where: { id: providerId, workspaceId },
    select: { id: true, type: true, webhookToken: true, webhookSecret: true },
  });
}

/** "Turn on": creates the URL (keeps the existing one if it's already on). */
export async function enableWebhook(workspaceId: string, providerId: string): Promise<Simple> {
  const p = await findApiProvider(workspaceId, providerId);
  if (!p) return { ok: false, error: NOT_FOUND };
  if (p.type === "SMTP") return { ok: false, error: NO_SMTP };
  if (p.webhookToken) return { ok: true };
  await db.sendingProvider.updateMany({ where: { id: p.id, workspaceId }, data: { webhookToken: newToken() } });
  return { ok: true };
}

/**
 * "Regenerate URL": the old URL stops working at once (e.g. it leaked).
 * The SES topic lock is cleared too, since a new subscription is needed.
 */
export async function regenerateWebhook(workspaceId: string, providerId: string): Promise<Simple> {
  const p = await findApiProvider(workspaceId, providerId);
  if (!p) return { ok: false, error: NOT_FOUND };
  if (p.type === "SMTP") return { ok: false, error: NO_SMTP };

  let webhookSecret = p.webhookSecret;
  if (p.type === "AMAZON_SES" && webhookSecret) {
    const secret = readWebhookSecret(webhookSecret);
    if (secret) {
      delete secret.topicArn;
      webhookSecret = Object.keys(secret).length ? encryptWebhookSecret(secret) : null;
    }
  }
  await db.sendingProvider.updateMany({
    where: { id: p.id, workspaceId },
    data: { webhookToken: newToken(), lastWebhookAt: null, webhookSecret },
  });
  return { ok: true };
}

/** "Turn off": the URL stops working and the signing secret is forgotten. */
export async function disableWebhook(workspaceId: string, providerId: string): Promise<Simple> {
  const p = await findApiProvider(workspaceId, providerId);
  if (!p) return { ok: false, error: NOT_FOUND };
  await db.sendingProvider.updateMany({
    where: { id: p.id, workspaceId },
    data: { webhookToken: null, webhookSecret: null, lastWebhookAt: null },
  });
  return { ok: true };
}

export type SaveSecretResult = { ok: true } | { ok: false; error?: string; errors?: SecretFieldErrors };

/** Saves the signing secret. Blank fields keep what's stored. */
export async function saveWebhookSecret(workspaceId: string, providerId: string, input: SecretInput): Promise<SaveSecretResult> {
  const p = await findApiProvider(workspaceId, providerId);
  if (!p) return { ok: false, error: NOT_FOUND };
  if (!isWebhookProviderType(p.type)) return { ok: false, error: NO_SMTP };

  const merged = mergeWebhookSecret(p.type, readWebhookSecret(p.webhookSecret), input);
  if (!merged.ok) return { ok: false, errors: merged.errors };
  if (!hasWebhookSecret(p.type, merged.secret)) return { ok: false, error: "Enter the value to save." };

  await db.sendingProvider.updateMany({
    where: { id: p.id, workspaceId },
    data: { webhookSecret: encryptWebhookSecret(merged.secret) },
  });
  return { ok: true };
}

/** Removes the signing secret (the URL token alone then protects the webhook). */
export async function clearWebhookSecret(workspaceId: string, providerId: string): Promise<Simple> {
  const p = await findApiProvider(workspaceId, providerId);
  if (!p) return { ok: false, error: NOT_FOUND };
  await db.sendingProvider.updateMany({ where: { id: p.id, workspaceId }, data: { webhookSecret: null } });
  return { ok: true };
}
