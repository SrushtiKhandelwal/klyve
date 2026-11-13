"use server";

import { loadEmailRows } from "@/app/(dashboard)/transactional/data";
import { parseLogFilters } from "@/components/transactional/filters";
import type { EmailRowView } from "@/components/transactional/types";
import { getVerifiedSender } from "@/lib/email/senders";
import { getCurrentUser } from "@/lib/session";
import { sendEmailInputSchema, type TransactionalStatusName } from "@/lib/transactional/schema";
import { enqueueTransactional } from "@/lib/transactional/send";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for the Transactional logs page. Anyone can call these with
// any input, so the workspace comes from the session (never the browser) and
// every input is checked again here.

// ── "Load more" ──────────────────────────────────────────────────────────────

export type LoadMoreResult = { ok: true; rows: EmailRowView[]; nextCursor: string | null } | { ok: false; error: string };

/** The next page of the logs list, with the same filters as the page. */
export async function loadMoreEmailsAction(filters: unknown, cursor: unknown): Promise<LoadMoreResult> {
  const ws = await requireActiveWorkspace();
  try {
    const f = parseLogFilters(filters && typeof filters === "object" ? (filters as Record<string, string>) : {});
    // Status comes back as e.g. "FAILED"; parseLogFilters accepts either case.
    const page = await loadEmailRows(ws.id, f, typeof cursor === "string" ? cursor : null);
    return { ok: true, ...page };
  } catch (error) {
    console.error("loadMoreEmailsAction failed:", error);
    return { ok: false, error: "Couldn't load more emails. Please try again." };
  }
}

// ── "Send a test email" ──────────────────────────────────────────────────────

// Any member may send a test, but at most TEST_LIMIT per TEST_WINDOW_MS per
// person, so the button can't be used to spam. Kept in memory: good enough for
// one server (it resets on restart). On globalThis so dev reloads don't reset it.
const TEST_LIMIT = 10;
const TEST_WINDOW_MS = 10 * 60 * 1000;
const g = globalThis as unknown as { __klyveTestSends?: Map<string, number[]> };
const recentSends = (g.__klyveTestSends ??= new Map<string, number[]>());

/** Records a send for this user, or returns how many seconds until they may send again. */
function takeTestSlot(userId: string): { ok: true } | { ok: false; retryInSeconds: number } {
  const now = Date.now();
  const times = (recentSends.get(userId) ?? []).filter((t) => now - t < TEST_WINDOW_MS);
  if (times.length >= TEST_LIMIT) {
    recentSends.set(userId, times);
    return { ok: false, retryInSeconds: Math.ceil((times[0] + TEST_WINDOW_MS - now) / 1000) };
  }
  times.push(now);
  recentSends.set(userId, times);
  // Don't let the map grow forever: drop people with no recent sends.
  if (recentSends.size > 5000) {
    for (const [id, list] of recentSends) if (list.every((t) => now - t >= TEST_WINDOW_MS)) recentSends.delete(id);
  }
  return { ok: true };
}

export type TestSendInput = {
  senderId?: unknown;
  to?: unknown;
  subject?: unknown;
  /** "html" | "text" | "template" */
  mode?: unknown;
  body?: unknown;
  templateId?: unknown;
  /** Params as JSON text, e.g. '{ "name": "Anita" }'. */
  params?: unknown;
};

export type TestSendResult =
  | { ok: true; id: string; status: TransactionalStatusName; error: string | null }
  | { ok: false; error: string; field?: string };

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function sendTestEmailAction(raw: TestSendInput): Promise<TestSendResult> {
  const ws = await requireActiveWorkspace();
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const input = raw && typeof raw === "object" ? raw : {};

  // The sender must be one of THIS workspace's verified senders.
  const sender = await getVerifiedSender(ws.id, str(input.senderId));
  if (!sender) return { ok: false, field: "senderId", error: "Choose one of your verified senders." };

  let params: Record<string, unknown> | undefined;
  const mode = str(input.mode);
  if (mode === "template") {
    const paramsText = str(input.params).trim();
    if (paramsText) {
      try {
        const parsed: unknown = JSON.parse(paramsText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
        params = parsed as Record<string, unknown>;
      } catch {
        return { ok: false, field: "params", error: 'Params must be a JSON object, like { "name": "Anita" }.' };
      }
    }
  }

  // Build exactly what an API call would send, then validate it with the same schema.
  const subject = str(input.subject).trim();
  const body = str(input.body);
  const request = {
    from: { email: sender.email, name: sender.name },
    to: str(input.to).trim(),
    ...(subject ? { subject } : {}),
    ...(mode === "template"
      ? { templateId: str(input.templateId), ...(params ? { params } : {}) }
      : mode === "text"
        ? { text: body }
        : { html: body }),
  };
  const parsed = sendEmailInputSchema.safeParse(request);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "");
    return { ok: false, field: field === "html" || field === "text" ? "body" : field, error: issue?.message ?? "Please check the form." };
  }
  if (mode !== "template" && !body.trim()) return { ok: false, field: "body", error: "Write a message to send." };

  // Only count attempts that would really send something.
  const slot = takeTestSlot(user.id);
  if (!slot.ok) {
    const minutes = Math.ceil(slot.retryInSeconds / 60);
    return { ok: false, error: `You've sent ${TEST_LIMIT} tests in the last 10 minutes. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  try {
    const result = await enqueueTransactional({ id: ws.id, name: ws.name }, parsed.data, {
      apiKeyId: null,
      idempotencyKey: null,
      source: "dashboard",
    });
    if (!result.ok) {
      const field = result.code === "sender_not_verified" ? "senderId" : result.code === "not_found" ? "templateId" : undefined;
      return { ok: false, error: result.message, ...(field ? { field } : {}) };
    }
    // No refresh() here: the dialog shows the result first and refreshes the
    // list itself when it closes (refreshing now could unmount the dialog).
    return {
      ok: true,
      id: result.email.id,
      status: result.email.status.toUpperCase() as TransactionalStatusName,
      error: result.email.error,
    };
  } catch (error) {
    console.error("sendTestEmailAction failed:", error);
    return { ok: false, error: "Something went wrong sending the test. Please try again." };
  }
}
