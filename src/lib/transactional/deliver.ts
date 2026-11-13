import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { RateLimiter } from "@/lib/campaigns/rate-limit";
import { nextUtcMidnight, utcDay } from "@/lib/campaigns/send-one";
import type { ProviderCredentials } from "@/lib/email/provider-configs";
import { trimMessage } from "@/lib/email/providers/shared";
import { sendEmailDetailed } from "@/lib/email/send";
import type { OutgoingEmail } from "@/lib/email/types";
import { checkTransactionalSuppression } from "./policy";

// Sends ONE transactional email that the worker has already claimed (status
// SENDING), then records what happened. Mirrors src/lib/campaigns/send-one.ts.
//
// The order of checks:
//   1. wait for the provider's speed limit (shared with campaigns)
//   2. sender still verified?             (deleted/unverified → FAILED)
//   3. suppression policy (policy.ts)     (a bounce may have arrived since
//                                          the email was queued → SUPPRESSED)
//   4. book one email of today's daily limit (none left → back to the queue
//      until midnight UTC; not a failure)
//   5. send, and record SENT / retry later / FAILED
//
// RETRIES: a temporary problem (timeout, rate limit, provider down) waits
// 1 min, 5 min, 15 min, 1 h, then the email is FAILED after 5 tries. A
// permanent problem (address refused, content rejected) FAILS at once.
//
// When the PROVIDER itself is the problem (can't reach it, wrong password),
// the rest of the batch isn't tried one by one: every email in it gets the
// same "temporary problem" (one try used), so a dead provider can't be
// hammered and nothing waits forever.
//
// NEVER TWICE: every write says `WHERE status = 'SENDING'`, so a row leaves
// SENDING exactly once. If something breaks AFTER the email was handed to the
// provider, the row is left in SENDING; the worker's stale check later marks
// it FAILED ("unknown") instead of risking a second copy.

/** Waits between tries: 1 min, 5 min, 15 min, 1 h. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
/** First try + one retry per delay = 5 tries, then FAILED. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** A row the worker claimed (status is SENDING in the database). */
export type ClaimedEmail = {
  id: string;
  workspaceId: string;
  providerId: string;
  senderId: string | null;
  toEmail: string;
  toName: string | null;
  fromEmail: string;
  fromName: string;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
  attempts: number;
};

export type LaneProvider = {
  id: string;
  workspaceId: string;
  name: string;
  status: "UNTESTED" | "CONNECTED" | "FAILED";
  dailyLimit: number | null;
};

/** Shared by every email sent through one provider in one worker lane. */
export type DeliverLane = {
  provider: LaneProvider;
  credentials: ProviderCredentials;
  limiter: RateLimiter;
  now: () => Date;
  isStopping: () => boolean;
  /** Set when further sending is pointless; the rest of the batch is handled without sending. */
  halt: null | { kind: "provider"; error: string } | { kind: "daily-limit" };
};

export type DeliverOutcome = "sent" | "retry" | "failed" | "suppressed" | "postponed" | "released" | "unknown";

const ts = (d: Date) => Prisma.sql`${d}::timestamp`;

// ── Status writes (all conditional on status = 'SENDING') ────────────────────

/** Back to the queue without using a try (stopping, daily limit, database hiccup). */
export async function releaseEmail(id: string, notBefore: Date | null = null, note: string | null = null): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE transactional_email
    SET status = 'QUEUED', "lockedAt" = NULL, "updatedAt" = now() AT TIME ZONE 'UTC',
        "nextAttemptAt" = COALESCE(${notBefore}::timestamp, "nextAttemptAt"),
        "lastError" = COALESCE(${note}::text, "lastError")
    WHERE id = ${id} AND status = 'SENDING'`);
}

async function markSent(id: string, providerMessageId: string | null, now: Date): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE transactional_email
    SET status = 'SENT', "sentAt" = ${ts(now)}, "providerMessageId" = ${providerMessageId}::text,
        "lockedAt" = NULL, "lastError" = NULL, attempts = attempts + 1, "updatedAt" = ${ts(now)}
    WHERE id = ${id} AND status = 'SENDING'`);
}

async function markFailed(id: string, error: string, countAttempt: boolean): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE transactional_email
    SET status = 'FAILED', "lastError" = ${trimMessage(error, 500)}, "lockedAt" = NULL,
        attempts = attempts + ${countAttempt ? 1 : 0}::int, "updatedAt" = now() AT TIME ZONE 'UTC'
    WHERE id = ${id} AND status = 'SENDING'`);
}

async function markSuppressed(id: string, reason: string, dropContent: boolean): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE transactional_email
    SET status = 'SUPPRESSED', "lastError" = ${reason}, "lockedAt" = NULL, "updatedAt" = now() AT TIME ZONE 'UTC',
        html = CASE WHEN ${dropContent}::boolean THEN '' ELSE html END,
        text = CASE WHEN ${dropContent}::boolean THEN '' ELSE text END
    WHERE id = ${id} AND status = 'SENDING'`);
}

/** A temporary problem: try again later, or give up after MAX_ATTEMPTS. */
export async function retryOrFail(row: ClaimedEmail, error: string, now: Date): Promise<"retry" | "failed"> {
  const attempt = row.attempts + 1;
  if (attempt >= MAX_ATTEMPTS) {
    await markFailed(row.id, `Gave up after ${attempt} tries. Last error: ${error}`, true);
    return "failed";
  }
  const at = new Date(now.getTime() + RETRY_DELAYS_MS[attempt - 1]);
  await db.$executeRaw(Prisma.sql`
    UPDATE transactional_email
    SET status = 'QUEUED', "lockedAt" = NULL, attempts = attempts + 1, "nextAttemptAt" = ${ts(at)},
        "lastError" = ${trimMessage(`Temporary problem (try ${attempt} of ${MAX_ATTEMPTS}), retrying automatically: ${error}`, 500)},
        "updatedAt" = ${ts(now)}
    WHERE id = ${row.id} AND status = 'SENDING'`);
  return "retry";
}

// ── Daily limit (shared with campaigns through provider_daily_usage) ─────────
// Same SQL as reserveDailySlot/refundDailySlot in src/lib/campaigns/send-one.ts
// (not exported there): the check and the +1 are ONE statement, so two
// workers can never both take the last slot.

async function reserveDailySlot(provider: LaneProvider, day: string): Promise<boolean> {
  if (provider.dailyLimit !== null && provider.dailyLimit <= 0) return false;
  const limitCheck =
    provider.dailyLimit === null ? Prisma.empty : Prisma.sql`WHERE provider_daily_usage.sent < ${provider.dailyLimit}::int`;
  const rows = await db.$queryRaw<{ sent: number }[]>(Prisma.sql`
    INSERT INTO provider_daily_usage ("providerId", day, sent)
    VALUES (${provider.id}, ${day}::date, 1)
    ON CONFLICT ("providerId", day) DO UPDATE SET sent = provider_daily_usage.sent + 1
    ${limitCheck}
    RETURNING sent`);
  return rows.length > 0;
}

async function refundDailySlot(providerId: string, day: string): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE provider_daily_usage SET sent = GREATEST(sent - 1, 0)
    WHERE "providerId" = ${providerId} AND day = ${day}::date`);
}

export function dailyLimitNote(provider: LaneProvider): string {
  const n = provider.dailyLimit ?? 0;
  return `Waiting: the provider "${provider.name}" reached its daily limit of ${n} email${n === 1 ? "" : "s"}. This email will be sent automatically after midnight (UTC).`;
}

/** The daily limit is used up: everything queued for this provider waits until midnight UTC. */
export async function postponeForDailyLimit(provider: LaneProvider, now: Date): Promise<number> {
  const midnight = nextUtcMidnight(now);
  return db.$executeRaw(Prisma.sql`
    UPDATE transactional_email
    SET "nextAttemptAt" = ${ts(midnight)}, "lastError" = ${dailyLimitNote(provider)}, "updatedAt" = ${ts(now)}
    WHERE "providerId" = ${provider.id} AND "workspaceId" = ${provider.workspaceId}
      AND status = 'QUEUED' AND "nextAttemptAt" < ${ts(midnight)}`);
}

// ── Provider status ──────────────────────────────────────────────────────────

async function markProviderWorking(provider: LaneProvider): Promise<void> {
  if (provider.status === "CONNECTED") return;
  provider.status = "CONNECTED"; // set first: only one email per lane does this write
  await db.sendingProvider.updateMany({
    where: { id: provider.id, workspaceId: provider.workspaceId },
    data: { status: "CONNECTED", lastError: null },
  });
}

/** Wrong key, paused account...: the settings page shows why. Queued emails keep waiting (retries). */
export async function markProviderBroken(provider: LaneProvider, reason: string): Promise<void> {
  provider.status = "FAILED";
  await db.sendingProvider.updateMany({
    where: { id: provider.id, workspaceId: provider.workspaceId },
    data: { status: "FAILED", lastError: trimMessage(reason, 300) },
  });
}

// ── The main function ────────────────────────────────────────────────────────

/** Processes one claimed email. Never throws. */
export async function deliverOne(lane: DeliverLane, row: ClaimedEmail): Promise<DeliverOutcome> {
  let handedToProvider = false;
  try {
    return await processEmail(lane, row, () => {
      handedToProvider = true;
    });
  } catch (err) {
    console.error(`[transactional] Error while sending email ${row.id}:`, err instanceof Error ? err.message : err);
    if (handedToProvider) return "unknown"; // left in SENDING → "status unknown" later, never resent
    await releaseEmail(row.id).catch(() => {});
    return "released";
  }
}

/** What happens to a claimed email once the lane has been halted (it isn't sent). */
export async function handleHalted(lane: DeliverLane, row: ClaimedEmail): Promise<DeliverOutcome> {
  const now = lane.now();
  if (lane.halt?.kind === "daily-limit") {
    await releaseEmail(row.id, nextUtcMidnight(now), dailyLimitNote(lane.provider));
    return "postponed";
  }
  if (lane.halt?.kind === "provider") return retryOrFail(row, lane.halt.error, now);
  await releaseEmail(row.id); // stopping
  return "released";
}

async function processEmail(lane: DeliverLane, row: ClaimedEmail, onHandOff: () => void): Promise<DeliverOutcome> {
  if (lane.halt || lane.isStopping()) return handleHalted(lane, row);

  // 1. Speed limit (the same limiter object campaigns use for this provider).
  await lane.limiter.take();
  if (lane.halt || lane.isStopping()) return handleHalted(lane, row);

  // 2. The From address must still be a verified sender of THIS workspace.
  const sender = row.senderId
    ? await db.sender.findFirst({
        where: { id: row.senderId, workspaceId: row.workspaceId, verifiedAt: { not: null } },
        select: { email: true },
      })
    : null;
  if (!sender || sender.email.toLowerCase() !== row.fromEmail) {
    await markFailed(row.id, `Not sent: the sender ${row.fromEmail} was deleted or is no longer verified. Verify it again in Settings → Senders.`, false);
    return "failed";
  }

  // 3. Suppression policy, re-checked: a bounce or complaint may have arrived since.
  const contact = await db.contact.findUnique({
    where: { workspaceId_email: { workspaceId: row.workspaceId, email: row.toEmail } },
    select: { status: true },
  });
  const verdict = await checkTransactionalSuppression(row.workspaceId, row.toEmail, contact?.status ?? null);
  if (verdict.blocked) {
    await markSuppressed(row.id, verdict.reason, verdict.erased);
    return "suppressed";
  }

  if (!row.html.trim() && !row.text.trim()) {
    // Only possible if the content was cleared (retention) while it waited: don't send an empty email.
    await markFailed(row.id, "Not sent: the email's content is no longer available.", false);
    return "failed";
  }

  // 4. Daily limit: book a slot first (given back below if nothing was sent).
  const day = utcDay(lane.now());
  if (!(await reserveDailySlot(lane.provider, day))) {
    lane.halt = { kind: "daily-limit" };
    await postponeForDailyLimit(lane.provider, lane.now());
    return handleHalted(lane, row);
  }

  // 5. Send. No List-Unsubscribe header and no tracking: this isn't marketing.
  const email: OutgoingEmail = {
    from: { email: row.fromEmail, name: row.fromName || undefined },
    to: row.toName ? { email: row.toEmail, name: row.toName.replace(/[\r\n]+/g, " ") } : { email: row.toEmail },
    replyTo: row.replyTo ?? undefined,
    subject: row.subject,
    html: row.html,
    text: row.text,
    // Our id, so the workspace (and support) can find this exact email in the logs.
    headers: { "X-Klyve-Email-Id": row.id },
    // Deliberately NO "kind" tag: the webhook parser only reads events whose kind
    // is "campaign" or missing, and transactional events are then matched by
    // the provider's message id (src/lib/webhooks/process.ts).
    tags: { klyve_email_id: row.id },
  };

  onHandOff();
  const result = await sendEmailDetailed(lane.credentials, email);
  const now = lane.now();

  if (result.ok) {
    await markSent(row.id, result.providerMessageId ?? null, now);
    await markProviderWorking(lane.provider);
    return "sent";
  }

  await refundDailySlot(lane.provider.id, day);

  if (result.providerIssue) {
    // The provider, not this email, is the problem: stop the lane for now.
    lane.halt = { kind: "provider", error: result.error };
    if (!result.retryable) await markProviderBroken(lane.provider, result.error);
    return retryOrFail(row, result.error, now);
  }
  if (result.retryable) return retryOrFail(row, result.error, now);

  // This one email was refused (bad address, rejected content): retrying won't help.
  await markFailed(row.id, result.error, true);
  return "failed";
}
