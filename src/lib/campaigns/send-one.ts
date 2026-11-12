import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/app-url";
import { createRecipientToken } from "@/lib/campaigns/tokens";
import type { RateLimiter } from "@/lib/campaigns/rate-limit";
import { sendEmailDetailed } from "@/lib/email/send";
import { trimMessage } from "@/lib/email/providers/shared";
import type { ProviderCredentials } from "@/lib/email/provider-configs";
import type { EmailAddress, OutgoingEmail } from "@/lib/email/types";
import { buildMergeData, compileTemplate, TemplateError, type CompiledTemplate } from "@/lib/templates/personalize";
import { trackingUrls } from "@/lib/tracking/links";

// Sends ONE campaign email to ONE recipient that the worker has already
// "claimed" (status SENDING), then records what happened.
//
// The order of checks matters:
//   1. wait for the provider's speed limit
//   2. campaign still SENDING?        (paused/cancelled meanwhile → let go)
//   3. contact still SUBSCRIBED?      (unsubscribed meanwhile → SKIPPED)
//   4. personalize the email
//   5. reserve one email of today's daily limit
//   6. send, and record SENT / retry later / FAILED
//
// Every database write below says `WHERE ... status = 'SENDING'`, so a row
// can only move out of SENDING once, even if two things race for it.
//
// Raw SQL note: values are always passed as parameters (${...} inside
// Prisma.sql), never glued into the SQL text. Status words like 'SENDING'
// are fixed constants written in the SQL itself.

// ── Settings ─────────────────────────────────────────────────────────────────

/** Waits between tries of a temporarily failing email: 1 min, 5 min, 30 min, 2 h. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
/** First try + one retry per delay above = 5 tries, then the email is FAILED. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** Informative notes the worker puts in campaign.lastError. They're not errors and are cleared automatically. */
const DAILY_NOTE_PREFIX = "Daily limit reached";
const TEMPORARY_NOTE_PREFIX = "Temporary problem:";

export function dailyLimitNote(providerName: string, limit: number): string {
  return `${DAILY_NOTE_PREFIX}: "${providerName}" may send ${limit} email${limit === 1 ? "" : "s"} per day. Sending continues automatically after midnight (UTC).`;
}

function temporaryNote(providerName: string, error: string): string {
  return `${TEMPORARY_NOTE_PREFIX} couldn't reach your provider "${providerName}" (${trimMessage(error, 200)}). Retrying automatically.`;
}

export function isWorkerNote(lastError: string | null | undefined): boolean {
  return !!lastError && (lastError.startsWith(DAILY_NOTE_PREFIX) || lastError.startsWith(TEMPORARY_NOTE_PREFIX));
}

const STOPPED_MESSAGE = (providerName: string, reason: string) =>
  `Your provider "${providerName}" stopped working: ${trimMessage(reason, 300).replace(/[.\s]+$/, "")}. Fix it in Settings → Sending providers, then resume.`;

// ── Types ────────────────────────────────────────────────────────────────────

/** A recipient row the worker claimed (status is SENDING in the database). */
export type ClaimedRecipient = {
  id: string;
  campaignId: string;
  contactId: string | null;
  email: string;
  attempts: number;
};

export type LaneProvider = {
  id: string;
  workspaceId: string;
  name: string;
  status: "UNTESTED" | "CONNECTED" | "FAILED";
  dailyLimit: number | null;
};

/**
 * Shared by every email sent through one provider in one worker "lane".
 * When something makes further sending pointless (provider broken, daily
 * limit hit, server stopping), `halt` is set and the remaining claimed
 * emails are simply put back in the queue.
 */
export type LaneContext = {
  provider: LaneProvider;
  credentials: ProviderCredentials;
  limiter: RateLimiter;
  /** The current time (tests pass a fixed time to simulate "later"). */
  now: () => Date;
  isStopping: () => boolean;
  halt: null | "provider-broken" | "provider-unreachable" | "daily-limit";
};

export type SendOutcome = "sent" | "retry" | "failed" | "skipped" | "released" | "unknown";

// ── Small SQL helpers ────────────────────────────────────────────────────────

/** A timestamp parameter. Our columns are "timestamp without time zone" holding UTC. */
const ts = (d: Date) => Prisma.sql`${d}::timestamp`;

/** "2026-11-13": the UTC day used for daily limits. */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The next midnight (UTC) after `d`: when a new daily allowance starts. */
export function nextUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

/** Puts a claimed row back in the queue (optionally not before `notBefore`). Not counted as an attempt. */
export async function releaseRecipient(id: string, notBefore: Date | null = null): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE campaign_recipient
    SET status = 'PENDING', "lockedAt" = NULL,
        "nextAttemptAt" = COALESCE(${notBefore}::timestamp, "nextAttemptAt")
    WHERE id = ${id} AND status = 'SENDING'`);
}

async function markSent(r: ClaimedRecipient, providerMessageId: string | null, now: Date): Promise<void> {
  // One statement updates the row AND the campaign counter, so they can't disagree.
  await db.$executeRaw(Prisma.sql`
    WITH done AS (
      UPDATE campaign_recipient
      SET status = 'SENT', "sentAt" = ${ts(now)}, "providerMessageId" = ${providerMessageId},
          "lockedAt" = NULL, "lastError" = NULL, attempts = attempts + 1
      WHERE id = ${r.id} AND status = 'SENDING'
      RETURNING "campaignId"
    )
    UPDATE campaign c SET "sentCount" = c."sentCount" + 1 FROM done WHERE c.id = done."campaignId"`);
}

async function markFailed(r: ClaimedRecipient, error: string, countAttempt: boolean): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    WITH done AS (
      UPDATE campaign_recipient
      SET status = 'FAILED', "lastError" = ${trimMessage(error, 500)}, "lockedAt" = NULL,
          attempts = attempts + ${countAttempt ? 1 : 0}::int
      WHERE id = ${r.id} AND status = 'SENDING'
      RETURNING "campaignId"
    )
    UPDATE campaign c SET "failedCount" = c."failedCount" + 1 FROM done WHERE c.id = done."campaignId"`);
}

async function markSkipped(r: ClaimedRecipient, reason: string): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    WITH done AS (
      UPDATE campaign_recipient
      SET status = 'SKIPPED', "lastError" = ${reason}, "lockedAt" = NULL
      WHERE id = ${r.id} AND status = 'SENDING'
      RETURNING "campaignId"
    )
    UPDATE campaign c SET "skippedCount" = c."skippedCount" + 1 FROM done WHERE c.id = done."campaignId"`);
}

async function scheduleRetry(r: ClaimedRecipient, error: string, at: Date): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE campaign_recipient
    SET status = 'PENDING', "lockedAt" = NULL, attempts = attempts + 1,
        "nextAttemptAt" = ${ts(at)}, "lastError" = ${trimMessage(error, 500)}
    WHERE id = ${r.id} AND status = 'SENDING'`);
}

/** Sets an informative note on a campaign, without hiding a real error (e.g. a pause reason). */
async function setNote(campaignIds: Prisma.Sql, note: string): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE campaign SET "lastError" = ${note}
    WHERE ${campaignIds} AND status = 'SENDING'
      AND ("lastError" IS NULL OR "lastError" LIKE 'Daily limit reached%' OR "lastError" LIKE 'Temporary problem:%')`);
}

/** Removes a note once sending works again. Raw SQL so `updatedAt` (our cache key) doesn't change. */
async function clearNote(campaignId: string): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE campaign SET "lastError" = NULL
    WHERE id = ${campaignId} AND ("lastError" LIKE 'Daily limit reached%' OR "lastError" LIKE 'Temporary problem:%')`);
}

// ── Daily limit ──────────────────────────────────────────────────────────────

/**
 * Books one email of today's allowance BEFORE sending. The check and the
 * +1 happen in one statement, so two workers can never both take the last
 * slot. Returns false when the limit is reached.
 */
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

/** Gives a booked slot back when the email didn't go out after all. */
async function refundDailySlot(providerId: string, day: string): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE provider_daily_usage SET sent = GREATEST(sent - 1, 0)
    WHERE "providerId" = ${providerId} AND day = ${day}::date`);
}

/** How many emails this provider sent on the UTC day of `now`. */
export async function sentToday(providerId: string, now: Date): Promise<number> {
  const rows = await db.$queryRaw<{ sent: number }[]>(Prisma.sql`
    SELECT sent FROM provider_daily_usage WHERE "providerId" = ${providerId} AND day = ${utcDay(now)}::date`);
  return rows[0]?.sent ?? 0;
}

/**
 * The provider used up today's allowance: everything still queued for its
 * sending campaigns waits until midnight UTC, and each campaign shows a note.
 */
export async function deferForDailyLimit(provider: LaneProvider, now: Date): Promise<void> {
  const midnight = nextUtcMidnight(now);
  await db.$executeRaw(Prisma.sql`
    UPDATE campaign_recipient r SET "nextAttemptAt" = ${ts(midnight)}
    FROM campaign c
    WHERE c.id = r."campaignId" AND c."providerId" = ${provider.id} AND c.status = 'SENDING'
      AND r.status = 'PENDING' AND r."nextAttemptAt" < ${ts(midnight)}`);
  await setNote(Prisma.sql`"providerId" = ${provider.id}`, dailyLimitNote(provider.name, provider.dailyLimit ?? 0));
}

// ── Provider status ──────────────────────────────────────────────────────────

/**
 * The provider itself is broken (wrong password, paused account, unreadable
 * credentials): every email would fail. We mark it FAILED (the settings
 * page shows why) and PAUSE every campaign currently sending through it,
 * so the user can fix it and resume. Nothing is lost: queued emails stay queued.
 */
export async function pauseForBrokenProvider(provider: LaneProvider, reason: string): Promise<void> {
  await db.sendingProvider.updateMany({
    where: { id: provider.id, workspaceId: provider.workspaceId },
    data: { status: "FAILED", lastError: trimMessage(reason, 300) },
  });
  provider.status = "FAILED";
  await db.campaign.updateMany({
    where: { providerId: provider.id, workspaceId: provider.workspaceId, status: "SENDING" },
    data: { status: "PAUSED", lastError: STOPPED_MESSAGE(provider.name, reason) },
  });
}

/** After a successful send, a provider marked FAILED/UNTESTED is clearly working again. */
async function markProviderWorking(provider: LaneProvider): Promise<void> {
  if (provider.status === "CONNECTED") return;
  provider.status = "CONNECTED"; // set first: only one email per lane does this write
  await db.sendingProvider.updateMany({
    where: { id: provider.id, workspaceId: provider.workspaceId },
    data: { status: "CONNECTED", lastError: null },
  });
}

// ── Campaign content (parsed once, reused for every recipient) ───────────────

type CampaignContent =
  | {
      ok: true;
      workspaceId: string;
      workspaceName: string;
      providerId: string | null;
      from: EmailAddress;
      replyTo?: string;
      compiled: CompiledTemplate;
    }
  | { ok: false; problem: string };

type CacheEntry = { updatedAt: number; loadedAt: number; content: CampaignContent };

// Kept on globalThis so a hot reload in development doesn't start a second cache.
const cacheStore = globalThis as unknown as { klyveCampaignContent?: Map<string, CacheEntry> };
const CACHE_MAX_AGE_MS = 60_000; // also refresh once a minute (e.g. the sender's name was edited)
const CACHE_MAX_ENTRIES = 200;

function contentCache(): Map<string, CacheEntry> {
  cacheStore.klyveCampaignContent ??= new Map();
  return cacheStore.klyveCampaignContent;
}

/**
 * The campaign's subject/HTML/text compiled once, plus the From address.
 * Re-loaded when the campaign row changes (`updatedAt`), e.g. after a resume.
 */
async function getContent(campaignId: string, updatedAt: Date): Promise<CampaignContent> {
  const cache = contentCache();
  const hit = cache.get(campaignId);
  if (hit && hit.updatedAt === updatedAt.getTime() && Date.now() - hit.loadedAt < CACHE_MAX_AGE_MS) return hit.content;

  const content = await loadContent(campaignId);
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string); // forget the oldest
  cache.set(campaignId, { updatedAt: updatedAt.getTime(), loadedAt: Date.now(), content });
  return content;
}

async function loadContent(campaignId: string): Promise<CampaignContent> {
  const c = await db.campaign.findUnique({
    where: { id: campaignId },
    select: {
      workspaceId: true,
      providerId: true,
      name: true,
      subject: true,
      html: true,
      text: true,
      workspace: { select: { name: true } },
      sender: { select: { workspaceId: true, email: true, name: true, replyTo: true, verifiedAt: true } },
    },
  });
  if (!c) return { ok: false, problem: "The campaign no longer exists." };
  // Only a verified sender of the SAME workspace may be used (no spoofing).
  if (!c.sender || !c.sender.verifiedAt || c.sender.workspaceId !== c.workspaceId) {
    return { ok: false, problem: "The sender of this campaign was deleted or is no longer verified. Verify the sender, then resume." };
  }
  let compiled: CompiledTemplate;
  try {
    // Same fallback as test emails (launch.ts): no subject → the campaign's name.
    compiled = compileTemplate({ html: c.html, text: c.text, subject: c.subject || c.name });
  } catch (err) {
    const why = err instanceof TemplateError ? err.message : "the email content couldn't be read";
    return { ok: false, problem: `There's a problem in the email content: ${why}` };
  }
  return {
    ok: true,
    workspaceId: c.workspaceId,
    workspaceName: c.workspace.name,
    providerId: c.providerId,
    from: { email: c.sender.email, name: c.sender.name || undefined },
    replyTo: c.sender.replyTo || undefined,
    compiled,
  };
}

// ── The main function ────────────────────────────────────────────────────────

const ONE_LINE = (s: string) => s.replace(/[\r\n\0]+/g, " ").trim();

/**
 * Processes one claimed recipient. Never throws for normal failures; if
 * something unexpected (like a database outage) happens BEFORE the email was
 * handed to the provider, the row goes back to the queue. If it happens
 * AFTER, the row is left in SENDING: the worker later marks it "status
 * unknown" instead of risking a duplicate email.
 */
export async function sendOne(ctx: LaneContext, r: ClaimedRecipient): Promise<SendOutcome> {
  let handedToProvider = false;
  try {
    return await processRecipient(ctx, r, () => {
      handedToProvider = true;
    });
  } catch (err) {
    console.error(`[campaigns] Error while sending recipient ${r.id}:`, err instanceof Error ? err.message : err);
    if (handedToProvider) return "unknown";
    await releaseRecipient(r.id).catch(() => {});
    return "released";
  }
}

async function processRecipient(ctx: LaneContext, r: ClaimedRecipient, onHandOff: () => void): Promise<SendOutcome> {
  if (await letGoIfHalted(ctx, r)) return "released";

  // 1. Speed limit.
  await ctx.limiter.take();
  if (await letGoIfHalted(ctx, r)) return "released";

  // 2. Is the campaign still sending? Checked per email so pause/cancel works within a second.
  const campaign = await db.campaign.findUnique({
    where: { id: r.campaignId },
    select: { status: true, updatedAt: true, lastError: true, providerId: true },
  });
  if (!campaign) return "released"; // deleted: its recipient rows are gone too
  if (campaign.status !== "SENDING") {
    if (campaign.status === "PAUSED") {
      await releaseRecipient(r.id); // resumes later
      return "released";
    }
    await markSkipped(r, `Not sent: the campaign was ${campaign.status === "CANCELLED" ? "cancelled" : campaign.status.toLowerCase()}.`);
    return "skipped";
  }
  if (campaign.providerId !== ctx.provider.id) {
    await releaseRecipient(r.id); // the provider changed; the right lane will pick it up
    return "released";
  }

  const content = await getContent(r.campaignId, campaign.updatedAt);
  if (!content.ok) {
    // A problem with the WHOLE campaign: pause it so the user can fix it.
    await db.campaign.updateMany({ where: { id: r.campaignId, status: "SENDING" }, data: { status: "PAUSED", lastError: content.problem } });
    await releaseRecipient(r.id);
    return "released";
  }

  // 3. Is the person still subscribed? (They may have unsubscribed since launch.)
  const contact = r.contactId
    ? await db.contact.findUnique({
        where: { id: r.contactId },
        select: { workspaceId: true, email: true, firstName: true, lastName: true, attributes: true, status: true },
      })
    : null;
  if (!contact || contact.workspaceId !== content.workspaceId) {
    await markSkipped(r, "Not sent: the contact was deleted.");
    return "skipped";
  }
  if (contact.status !== "SUBSCRIBED") {
    await markSkipped(r, `Not sent: the contact is ${contact.status.toLowerCase()}.`);
    return "skipped";
  }

  // 4. Personalize.
  const unsubscribeToken = createRecipientToken(r.id, "unsubscribe");
  const data = {
    ...buildMergeData(contact, {
      unsubscribeUrl: absoluteUrl(`/u/${unsubscribeToken}`), // the page link in the email body
      viewInBrowserUrl: absoluteUrl(`/v/${createRecipientToken(r.id, "view")}`),
      workspaceName: content.workspaceName,
    }),
    // Phase 5: this person's tracking addresses. Launch rewrote links to
    // {{ tracking.click_base }}/<position> and added an {{ tracking.open_url }}
    // pixel (only when tracking is on; otherwise these values are unused).
    tracking: trackingUrls(r.id),
  };
  let parts: { html: string; text: string; subject: string };
  try {
    parts = content.compiled.render(data);
  } catch (err) {
    // A problem with THIS contact's values only (e.g. a render limit). Others may be fine.
    await markFailed(r, err instanceof TemplateError ? err.message : "The email couldn't be personalized.", false);
    return "failed";
  }

  const toName = ONE_LINE([contact.firstName, contact.lastName].filter(Boolean).join(" "));
  const email: OutgoingEmail = {
    from: content.from,
    to: toName ? { email: r.email, name: toName } : { email: r.email },
    replyTo: content.replyTo,
    subject: parts.subject,
    html: parts.html,
    text: parts.text,
    headers: {
      // RFC 2369 + RFC 8058: Gmail/Yahoo show an "Unsubscribe" button and
      // POST to this URL with one click (no page, no login).
      "List-Unsubscribe": `<${absoluteUrl(`/api/unsubscribe/${unsubscribeToken}`)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      // Asks auto-responders (out-of-office replies) not to answer a bulk mailing (RFC 3834).
      Precedence: "bulk",
      // Our ids, so bounce/complaint reports (Phase 5) can be matched to this exact email.
      "X-Klyve-Campaign": r.campaignId,
      "X-Klyve-Recipient": r.id,
    },
    tags: { kind: "campaign", campaign_id: r.campaignId, recipient_id: r.id },
  };

  // 5. Daily limit: book a slot first (given back below if nothing was sent).
  const day = utcDay(ctx.now());
  if (!(await reserveDailySlot(ctx.provider, day))) {
    ctx.halt = "daily-limit";
    await releaseRecipient(r.id, nextUtcMidnight(ctx.now()));
    await deferForDailyLimit(ctx.provider, ctx.now());
    return "released";
  }

  // 6. Send.
  onHandOff();
  const result = await sendEmailDetailed(ctx.credentials, email);
  const now = ctx.now();

  if (result.ok) {
    await markSent(r, result.providerMessageId ?? null, now);
    if (isWorkerNote(campaign.lastError)) await clearNote(r.campaignId);
    await markProviderWorking(ctx.provider);
    return "sent";
  }

  await refundDailySlot(ctx.provider.id, day);

  if (!result.retryable && result.providerIssue) {
    // The provider is broken for EVERY email: pause, don't burn this person's tries.
    ctx.halt = "provider-broken";
    await releaseRecipient(r.id);
    await pauseForBrokenProvider(ctx.provider, result.error);
    return "released";
  }

  if (result.retryable) {
    const attempt = r.attempts + 1;
    if (result.providerIssue) {
      // Can't reach the provider at all (timeout, connection refused): stop this
      // provider for a short while instead of trying every queued email.
      ctx.halt = "provider-unreachable";
      await setNote(Prisma.sql`id = ${r.campaignId}`, temporaryNote(ctx.provider.name, result.error));
    }
    if (attempt >= MAX_ATTEMPTS) {
      await markFailed(r, `Gave up after ${attempt} tries. Last error: ${result.error}`, true);
      return "failed";
    }
    await scheduleRetry(r, result.error, new Date(now.getTime() + RETRY_DELAYS_MS[attempt - 1]));
    return "retry";
  }

  // This one email was refused (bad address, rejected content): retrying won't help.
  await markFailed(r, result.error, true);
  return "failed";
}

/** If the lane was halted, put the row back in the queue and report true. */
async function letGoIfHalted(ctx: LaneContext, r: ClaimedRecipient): Promise<boolean> {
  if (!ctx.halt && !ctx.isStopping()) return false;
  const notBefore = ctx.halt === "daily-limit" ? nextUtcMidnight(ctx.now()) : null;
  await releaseRecipient(r.id, notBefore);
  return true;
}
