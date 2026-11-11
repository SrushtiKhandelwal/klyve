"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  buildTestEmail,
  createProvider,
  deleteProvider,
  getProviderSummary,
  markProviderFailed,
  setDefaultProvider,
  takeTestEmailSlot,
  updateProvider,
  type FieldErrors,
  type ProviderInput,
} from "@/lib/email/provider-admin";
import { sendWithStoredProvider, testStoredProvider } from "@/lib/email/stored-provider";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace, type ActiveWorkspace } from "@/lib/workspace";
import {
  emailAddressSchema,
  needsVerifiedFrom,
  providerLabel,
  suggestedTestFrom,
} from "@/components/settings/providers/provider-rules";

// Server Actions for Settings → Sending providers.
//
// Server Actions are public endpoints: anyone can call them with any input.
// So every action below:
//  1. works out the workspace from the session (requireActiveWorkspace),
//  2. checks the user's role where it matters (only OWNER and ADMIN may add,
//     edit, delete or change the default; MEMBERs may test), and
//  3. passes ws.id to provider-admin.ts, which filters every query by it.
// Nothing returned from here ever contains the stored credentials.

/** Result of a connection test or a test email, safe to show in the UI. */
export type ProviderCheckOutcome = { ok: true; detail?: string } | { ok: false; error: string };

export type SaveProviderActionResult =
  | { ok: true; providerId: string; test: ProviderCheckOutcome }
  | { ok: false; errors?: FieldErrors; message?: string };

export type SimpleActionResult = { ok: true; message?: string } | { ok: false; error: string };

const idSchema = z.string().trim().min(1).max(64);
const NOT_ALLOWED = "Only workspace owners and admins can change sending providers.";
const NOT_FOUND = "This provider no longer exists.";

function canManage(ws: ActiveWorkspace): boolean {
  return ws.role === "OWNER" || ws.role === "ADMIN";
}

/**
 * For errors we did NOT expect (the send/test helpers normally return a
 * friendly error instead of throwing). We log the details on the server and
 * show a plain message, because raw error text can contain internals.
 */
function unexpectedError(error: unknown, what: string): string {
  console.error(`[providers] ${what} crashed:`, error);
  return "Something went wrong on our side while talking to the provider. Please try again.";
}

/**
 * Runs the connection test. testStoredProvider records the result
 * (status, lastTestedAt, lastError) itself; if it crashes instead, we record
 * the failure so the provider never stays "Untested" without a reason.
 */
async function runConnectionTest(workspaceId: string, providerId: string): Promise<ProviderCheckOutcome> {
  try {
    const result = await testStoredProvider(workspaceId, providerId);
    return result.ok ? { ok: true, detail: result.detail } : { ok: false, error: result.error };
  } catch (error) {
    const message = unexpectedError(error, "Connection test");
    await markProviderFailed(workspaceId, providerId, message);
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Add / edit / delete / default
// ---------------------------------------------------------------------------

/** Saves a new provider, then tests the connection straight away. */
export async function createProviderAction(type: unknown, input: ProviderInput): Promise<SaveProviderActionResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, message: NOT_ALLOWED };

  const saved = await createProvider(ws.id, type, input ?? {});
  if (!saved.ok) return saved;

  // Keep the provider even if the test fails: it's then marked Failed with the reason.
  const test = await runConnectionTest(ws.id, saved.providerId);
  refresh();
  return { ok: true, providerId: saved.providerId, test };
}

/** Saves changes (blank secrets keep their old value), then re-tests. */
export async function updateProviderAction(providerId: unknown, input: ProviderInput): Promise<SaveProviderActionResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, message: NOT_ALLOWED };
  const id = idSchema.safeParse(providerId);
  if (!id.success) return { ok: false, message: NOT_FOUND };

  const saved = await updateProvider(ws.id, id.data, input ?? {});
  if (!saved.ok) return saved;

  const test = await runConnectionTest(ws.id, id.data);
  refresh();
  return { ok: true, providerId: id.data, test };
}

export async function deleteProviderAction(providerId: unknown): Promise<SimpleActionResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };
  const id = idSchema.safeParse(providerId);
  if (!id.success) return { ok: false, error: NOT_FOUND };

  const result = await deleteProvider(ws.id, id.data);
  if (!result.ok) return { ok: false, error: NOT_FOUND };
  refresh();
  return {
    ok: true,
    message: result.newDefault ? `“${result.newDefault.name}” is now your default provider.` : undefined,
  };
}

export async function setDefaultProviderAction(providerId: unknown): Promise<SimpleActionResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };
  const id = idSchema.safeParse(providerId);
  if (!id.success) return { ok: false, error: NOT_FOUND };

  const ok = await setDefaultProvider(ws.id, id.data);
  if (!ok) return { ok: false, error: NOT_FOUND };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Testing (any member)
// ---------------------------------------------------------------------------

export async function testProviderAction(providerId: unknown): Promise<ProviderCheckOutcome> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(providerId);
  if (!id.success) return { ok: false, error: NOT_FOUND };

  const provider = await getProviderSummary(ws.id, id.data);
  if (!provider) return { ok: false, error: NOT_FOUND };

  const result = await runConnectionTest(ws.id, provider.id);
  refresh();
  return result;
}

/**
 * Sends the "It works!" email through a provider.
 * Limited to TEST_EMAILS_PER_HOUR per provider (see takeTestEmailSlot).
 */
export async function sendTestEmailAction(
  providerId: unknown,
  input: { to?: unknown; from?: unknown },
): Promise<ProviderCheckOutcome> {
  const ws = await requireActiveWorkspace();
  const user = await requireUser();
  const id = idSchema.safeParse(providerId);
  if (!id.success) return { ok: false, error: NOT_FOUND };

  const to = emailAddressSchema.safeParse(input?.to);
  if (!to.success) return { ok: false, error: "Please enter a valid recipient email address." };

  const provider = await getProviderSummary(ws.id, id.data);
  if (!provider) return { ok: false, error: NOT_FOUND };

  // SMTP: we pick the From ourselves (see suggestedTestFrom).
  // API providers: the user tells us an address they verified with the provider.
  let from = suggestedTestFrom(provider.type, provider.hint, user.email);
  if (needsVerifiedFrom(provider.type)) {
    const requested = typeof input?.from === "string" ? input.from.trim() : "";
    if (requested) {
      const parsed = emailAddressSchema.safeParse(requested);
      if (!parsed.success) return { ok: false, error: "Please enter a valid From address." };
      from = parsed.data;
    }
  }

  const slot = takeTestEmailSlot(ws.id, provider.id);
  if (!slot.ok) {
    return {
      ok: false,
      error: `You've sent the maximum number of test emails with this provider for now. Try again in ${slot.retryInMinutes} minute${slot.retryInMinutes === 1 ? "" : "s"}.`,
    };
  }

  const email = buildTestEmail({ providerName: provider.name, providerType: provider.type, to: to.data, from });
  try {
    const result = await sendWithStoredProvider(ws.id, provider.id, email);
    refresh();
    if (result.ok) return { ok: true, detail: `Sent to ${to.data} from ${from}.` };
    const hint = needsVerifiedFrom(provider.type)
      ? ` Check that ${from} is an address or domain you verified with ${providerLabel(provider.type)}.`
      : "";
    return { ok: false, error: `${result.error}${hint}` };
  } catch (error) {
    return { ok: false, error: unexpectedError(error, "Test email") };
  }
}
