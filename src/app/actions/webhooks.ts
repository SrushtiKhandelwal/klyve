"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  clearWebhookSecret,
  disableWebhook,
  enableWebhook,
  regenerateWebhook,
  saveWebhookSecret,
  type SaveSecretResult,
} from "@/lib/webhooks/admin";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for the "Bounce & complaint tracking" card on a provider's
// settings page. Like every Server Action they are public endpoints, so each one:
//  1. gets the workspace from the session (never from the input),
//  2. allows only OWNER and ADMIN (the webhook URL is a secret),
//  3. validates the input with zod, and
//  4. passes ws.id to src/lib/webhooks/admin.ts, which filters every query by it.

export type WebhookActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.string().trim().min(1).max(64);
const NOT_ALLOWED = "Only workspace owners and admins can change bounce tracking.";
const NOT_FOUND = "This provider no longer exists.";

/** The user + role check shared by all actions below. */
async function managerWorkspace() {
  const ws = await requireActiveWorkspace();
  return ws.role === "OWNER" || ws.role === "ADMIN" ? ws : null;
}

async function run(
  providerId: unknown,
  action: (workspaceId: string, providerId: string) => Promise<{ ok: true } | { ok: false; error: string }>,
): Promise<WebhookActionResult> {
  const ws = await managerWorkspace();
  if (!ws) return { ok: false, error: NOT_ALLOWED };
  const id = idSchema.safeParse(providerId);
  if (!id.success) return { ok: false, error: NOT_FOUND };
  const result = await action(ws.id, id.data);
  if (result.ok) refresh();
  return result;
}

export async function enableWebhookAction(providerId: unknown): Promise<WebhookActionResult> {
  return run(providerId, enableWebhook);
}

export async function regenerateWebhookAction(providerId: unknown): Promise<WebhookActionResult> {
  return run(providerId, regenerateWebhook);
}

export async function disableWebhookAction(providerId: unknown): Promise<WebhookActionResult> {
  return run(providerId, disableWebhook);
}

export async function clearWebhookSecretAction(providerId: unknown): Promise<WebhookActionResult> {
  return run(providerId, clearWebhookSecret);
}

/** Only these field names are read; each is a short string (blank = keep the stored value). */
const secretInputSchema = z
  .object({
    signingSecret: z.string().max(2000),
    publicKey: z.string().max(2000),
    signingKey: z.string().max(2000),
    username: z.string().max(2000),
    password: z.string().max(2000),
    topicArn: z.string().max(2000),
  })
  .partial()
  .strip();

export async function saveWebhookSecretAction(providerId: unknown, input: unknown): Promise<SaveSecretResult> {
  const ws = await managerWorkspace();
  if (!ws) return { ok: false, error: NOT_ALLOWED };
  const id = idSchema.safeParse(providerId);
  if (!id.success) return { ok: false, error: NOT_FOUND };
  const fields = secretInputSchema.safeParse(input ?? {});
  if (!fields.success) return { ok: false, error: "Some values are too long." };

  const result = await saveWebhookSecret(ws.id, id.data, fields.data);
  if (result.ok) refresh();
  return result;
}
