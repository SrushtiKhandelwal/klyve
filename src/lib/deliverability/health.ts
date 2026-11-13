import "server-only";
import { Prisma, type ProviderType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { readStoredResult } from "@/lib/email/dns-check";
import {
  AUTO_PAUSE_PREFIX,
  BOUNCE_RATE_CRITICAL,
  COMPLAINT_RATE_LIMIT,
  RESUMED_NOTE_PREFIX,
  bounceStatus,
  complaintStatus,
  formatPercent,
  unsubscribeStatus,
  type HealthStatus,
} from "@/lib/deliverability/thresholds";

// SENDING HEALTH: how many emails bounce or get marked as spam, per
// workspace and per provider, and the automatic "emergency brake" that
// pauses a campaign whose rates become dangerous.
//
// Why the brake exists: users send through THEIR OWN provider account
// (Amazon SES, SendGrid, Gmail...). Providers suspend accounts whose bounce
// or complaint rates get too high, and Gmail/Yahoo start sending everything
// to spam. Stopping a bad campaign early protects the user's reputation and
// their account. They can always resume after looking at the list.

const ts = (d: Date) => Prisma.sql`${d}::timestamp`;

// ─────────────────────────────────────────────────────────────────────────────
// Workspace health (the Deliverability page)
// ─────────────────────────────────────────────────────────────────────────────

export type RateSet = {
  sent: number;
  hardBounces: number;
  complaints: number;
  unsubscribes: number;
  bounceRate: number;
  complaintRate: number;
  unsubscribeRate: number;
  status: { bounce: HealthStatus; complaint: HealthStatus; unsubscribe: HealthStatus };
};

export type ProviderHealth = RateSet & {
  /** null = emails sent through a provider that was deleted since. */
  id: string | null;
  name: string;
  type: ProviderType | null;
  /** Webhook URL created (the provider can report bounces and complaints to us). */
  webhookEnabled: boolean;
  lastWebhookAt: Date | null;
};

export type AutoPause = {
  campaignId: string;
  name: string;
  status: string;
  sentCount: number;
  message: string;
  at: Date;
};

export type WorkspaceHealth = {
  days: number;
  since: Date;
  overall: RateSet;
  providers: ProviderHealth[];
  suppressedCount: number;
  autoPauses: AutoPause[];
  domains: { total: number; authenticated: number; checked: number };
};

function rates(sent: number, hardBounces: number, complaints: number, unsubscribes: number): RateSet {
  const of = (n: number) => (sent > 0 ? n / sent : 0);
  const bounceRate = of(hardBounces);
  const complaintRate = of(complaints);
  const unsubscribeRate = of(unsubscribes);
  return {
    sent,
    hardBounces,
    complaints,
    unsubscribes,
    bounceRate,
    complaintRate,
    unsubscribeRate,
    status: {
      bounce: bounceStatus(bounceRate, sent),
      complaint: complaintStatus(complaintRate, sent),
      unsubscribe: unsubscribeStatus(unsubscribeRate, sent),
    },
  };
}

/**
 * Rates for emails SENT in the last `days` days (default 30), overall and
 * per provider. A bounce or complaint counts towards the day its email was
 * sent, the way providers measure it. Hard bounces only: a soft bounce
 * (mailbox full) says nothing about the list's quality.
 *
 * `workspaceId` must come from requireActiveWorkspace().
 */
export async function getWorkspaceHealth(workspaceId: string, opts: { days?: number } = {}): Promise<WorkspaceHealth> {
  const days = Math.min(Math.max(Math.floor(opts.days ?? 30), 1), 365);
  const since = new Date(Date.now() - days * 86_400_000);

  // One pass over this workspace's recently sent emails, grouped by provider.
  // The campaign filter skips campaigns that finished before the window.
  const grouped = await db.$queryRaw<
    { providerId: string | null; sent: number; hard: number; complaints: number; unsubscribes: number }[]
  >(Prisma.sql`
    SELECT c."providerId",
           count(*)::int AS sent,
           count(*) FILTER (WHERE r."bounceType" = 'hard')::int AS hard,
           count(*) FILTER (WHERE r."complainedAt" IS NOT NULL)::int AS complaints,
           count(*) FILTER (WHERE r."unsubscribedAt" IS NOT NULL)::int AS unsubscribes
    FROM campaign_recipient r
    JOIN campaign c ON c.id = r."campaignId"
    WHERE c."workspaceId" = ${workspaceId}
      AND c."startedAt" IS NOT NULL
      AND (c."finishedAt" IS NULL OR c."finishedAt" >= ${ts(since)})
      AND r.status = 'SENT' AND r."sentAt" >= ${ts(since)}
    GROUP BY c."providerId"`);

  const [providers, suppressedCount, autoPaused, domains] = await Promise.all([
    db.sendingProvider.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, type: true, webhookToken: true, lastWebhookAt: true },
    }),
    db.suppression.count({ where: { workspaceId } }),
    db.campaign.findMany({
      where: {
        workspaceId,
        OR: [{ lastError: { startsWith: AUTO_PAUSE_PREFIX } }, { lastError: { startsWith: RESUMED_NOTE_PREFIX } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, name: true, status: true, sentCount: true, lastError: true, updatedAt: true },
    }),
    db.sendingDomain.findMany({ where: { workspaceId }, select: { lastResult: true } }),
  ]);

  const byProvider = new Map(grouped.map((g) => [g.providerId, g]));
  const total = grouped.reduce(
    (t, g) => ({ sent: t.sent + g.sent, hard: t.hard + g.hard, complaints: t.complaints + g.complaints, unsubscribes: t.unsubscribes + g.unsubscribes }),
    { sent: 0, hard: 0, complaints: 0, unsubscribes: 0 },
  );

  const providerRows: ProviderHealth[] = providers.map((p) => {
    const g = byProvider.get(p.id);
    return {
      ...rates(g?.sent ?? 0, g?.hard ?? 0, g?.complaints ?? 0, g?.unsubscribes ?? 0),
      id: p.id,
      name: p.name,
      type: p.type,
      webhookEnabled: !!p.webhookToken,
      lastWebhookAt: p.lastWebhookAt,
    };
  });
  const orphan = byProvider.get(null);
  if (orphan) {
    providerRows.push({
      ...rates(orphan.sent, orphan.hard, orphan.complaints, orphan.unsubscribes),
      id: null,
      name: "Deleted provider",
      type: null,
      webhookEnabled: false,
      lastWebhookAt: null,
    });
  }

  // "Authenticated" = the last DNS check passed DKIM and DMARC, and SPF isn't missing.
  const results = domains.map((d) => readStoredResult(d.lastResult));
  const authenticated = results.filter(
    (r) => r && r.dkim.status === "pass" && r.dmarc.status === "pass" && r.spf.status !== "missing",
  ).length;

  return {
    days,
    since,
    overall: rates(total.sent, total.hard, total.complaints, total.unsubscribes),
    providers: providerRows,
    suppressedCount,
    autoPauses: autoPaused.map((c) => ({
      campaignId: c.id,
      name: c.name,
      status: c.status,
      sentCount: c.sentCount,
      message: c.lastError ?? "",
      at: c.updatedAt,
    })),
    domains: { total: domains.length, authenticated, checked: results.filter(Boolean).length },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The automatic pause (called by the campaign worker)
// ─────────────────────────────────────────────────────────────────────────────
//
// WHEN WE CHECK
//  - Not before MIN_SAMPLE (200) emails were sent, or 10% of the campaign's
//    recipients if that's more. On a small sample a handful of bad addresses
//    makes the rate look terrible (3 bounces in 40 emails = 7.5%), and lists
//    are often sorted (oldest sign-ups or one bad import first), so the first
//    emails can be worse than the list as a whole. After that, every worker
//    tick in which the campaign sent emails (bounce reports keep arriving).
//
// LIMITS: hard bounces ≥ 5%, or spam complaints ≥ 0.3% (the Gmail/Yahoo limit).
//
// AFTER THE USER RESUMES
//  We don't pause again straight away (the rate is still above the limit,
//  since it includes the emails that caused the pause). We wait until
//  RECHECK_AFTER (200) more emails were sent, and from then on only count the
//  emails sent SINCE the pause. So a user who cleaned the list gets a fair
//  fresh start, and one who didn't is stopped again after 200 more emails.
//
// WHERE "SENT AT THE TIME OF THE PAUSE" IS KEPT (no schema change needed)
//  1. In the pause message itself: "Paused automatically after 250 emails: …".
//  2. Resuming clears that message (launch.ts), so each tick also copies the
//     number from PAUSED campaigns into memory (scanAutoPaused) first.
//  3. Once the campaign is sending again, we write a durable note:
//     "Resumed after an automatic pause at 250 emails sent. …", which
//     survives server restarts. The campaign page shows it as an info note;
//     completing the campaign clears it.
//  The only gap: a server restart in the ~1 second between "Resume" and the
//  next tick. Then the campaign is treated as never paused (checked again
//  right away, so it errs on the safe side).

export const MIN_SAMPLE = 200;
export const MIN_SAMPLE_SHARE = 0.1;
export const RECHECK_AFTER = 200;

type HealthMemory = {
  /** campaignId → emails sent when it was auto-paused (+ the send time that marks the cut, once known). */
  paused: Map<string, { sentAtPause: number; cutoff?: Date | null }>;
  /** campaignId → sentCount at the last look, to only check campaigns that sent something. */
  lastSeen: Map<string, number>;
};

// On globalThis, like the worker's own state, so development hot reloads keep it.
const holder = globalThis as unknown as { klyveSendingHealth?: HealthMemory };
function memory(): HealthMemory {
  holder.klyveSendingHealth ??= { paused: new Map(), lastSeen: new Map() };
  return holder.klyveSendingHealth;
}

const count = (n: number) => n.toLocaleString("en-US");

/** Reads "250" back out of our own messages (null if it isn't one). */
export function sentAtPauseFrom(lastError: string | null | undefined): number | null {
  if (!lastError) return null;
  const m = /^(?:Paused automatically after|Resumed after an automatic pause at) ([\d,]+) email/.exec(lastError);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function bounceMessage(sentCount: number, rate: number, sinceResume: number | null): string {
  const what = sinceResume === null ? "of them bounced" : `of the ${count(sinceResume)} emails sent since you resumed bounced`;
  return (
    `${AUTO_PAUSE_PREFIX}${count(sentCount)} emails: ${formatPercent(rate)} ${what} ` +
    `(limit ${formatPercent(BOUNCE_RATE_CRITICAL)}). This usually means an old or purchased list. ` +
    `Clean the list (remove bounced addresses) before resuming; resuming anyway may get your provider account suspended.`
  );
}

function complaintMessage(sentCount: number, rate: number, sinceResume: number | null): string {
  const who = sinceResume === null ? "of recipients" : `of the ${count(sinceResume)} people emailed since you resumed`;
  return (
    `${AUTO_PAUSE_PREFIX}${count(sentCount)} emails: ${formatPercent(rate)} ${who} marked it as spam ` +
    `(limit ${formatPercent(COMPLAINT_RATE_LIMIT)}, the Gmail and Yahoo maximum). Only email people who asked to hear ` +
    `from you, and make unsubscribing easy, before resuming; resuming anyway may get your provider account suspended.`
  );
}

function resumedNote(sentAtPause: number): string {
  return (
    `${RESUMED_NOTE_PREFIX}${count(sentAtPause)} emails sent. Bounces and spam complaints are checked again ` +
    `after ${count(RECHECK_AFTER)} more emails, counting only the emails sent since then.`
  );
}

export type HealthCheckResult =
  | { action: "none"; reason: "not-sending" | "too-few-sent" | "waiting-after-resume" | "healthy" }
  | { action: "paused"; reason: "bounces" | "complaints"; message: string };

/**
 * Checks ONE campaign and pauses it if it's unhealthy. Only SENDING
 * campaigns are looked at. Safe to call often: it's one primary-key read,
 * plus one indexed count after a resume.
 */
export async function checkCampaignHealth(campaignId: string): Promise<HealthCheckResult> {
  const c = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true, sentCount: true, recipientCount: true, bounceCount: true, complaintCount: true, lastError: true },
  });
  if (!c || c.status !== "SENDING") return { action: "none", reason: "not-sending" };

  const mem = memory();
  const remembered = mem.paused.get(campaignId);
  const sentAtPause = remembered?.sentAtPause ?? sentAtPauseFrom(c.lastError);

  let sample: number;
  let bounces: number;
  let complaints: number;
  let sinceResume: number | null = null;

  if (sentAtPause !== null) {
    // Resumed after an automatic pause.
    if (!remembered) mem.paused.set(campaignId, { sentAtPause });
    if (!c.lastError) {
      // Make the "resumed" state durable. Only into an empty message, so a
      // real problem (or the worker's daily-limit note) is never hidden.
      await db.$executeRaw(Prisma.sql`
        UPDATE campaign SET "lastError" = ${resumedNote(sentAtPause)}
        WHERE id = ${campaignId} AND status = 'SENDING' AND "lastError" IS NULL`);
    }
    if (c.sentCount - sentAtPause < RECHECK_AFTER) return { action: "none", reason: "waiting-after-resume" };

    const w = await countSinceSend(campaignId, sentAtPause);
    sample = w.sent;
    bounces = w.hard;
    complaints = w.complaints;
    sinceResume = w.sent;
    if (sample < RECHECK_AFTER) return { action: "none", reason: "waiting-after-resume" };
  } else {
    const minSample = Math.max(MIN_SAMPLE, Math.ceil(c.recipientCount * MIN_SAMPLE_SHARE));
    if (c.sentCount < minSample) return { action: "none", reason: "too-few-sent" };
    sample = c.sentCount;
    bounces = c.bounceCount; // hard bounces only (see tracking/record.ts)
    complaints = c.complaintCount;
  }

  const complaintRate = complaints / sample;
  const bounceRate = bounces / sample;
  // Complaints first: they do the most damage (Gmail/Yahoo block on them).
  let verdict: Extract<HealthCheckResult, { action: "paused" }> | null = null;
  if (complaintRate >= COMPLAINT_RATE_LIMIT) {
    verdict = { action: "paused", reason: "complaints", message: complaintMessage(c.sentCount, complaintRate, sinceResume) };
  } else if (bounceRate >= BOUNCE_RATE_CRITICAL) {
    verdict = { action: "paused", reason: "bounces", message: bounceMessage(c.sentCount, bounceRate, sinceResume) };
  }
  if (!verdict) return { action: "none", reason: "healthy" };

  // Same conditional update as pauseCampaign() in launch.ts: only a campaign
  // that is STILL sending is paused, so we never undo a user's cancel.
  const paused = await db.campaign.updateMany({
    where: { id: campaignId, status: "SENDING" },
    data: { status: "PAUSED", lastError: verdict.message },
  });
  if (paused.count === 0) return { action: "none", reason: "not-sending" };

  mem.paused.set(campaignId, { sentAtPause: c.sentCount });
  console.warn(`[sending health] Paused campaign ${campaignId}: ${verdict.reason} (${count(c.sentCount)} sent)`);
  return verdict;
}

/**
 * Hard bounces and complaints among the emails sent AFTER the first
 * `skip` emails of the campaign (i.e. since an automatic pause). The send
 * time of email number `skip` is looked up once and remembered.
 */
async function countSinceSend(campaignId: string, skip: number): Promise<{ sent: number; hard: number; complaints: number }> {
  const mem = memory();
  const entry = mem.paused.get(campaignId) ?? { sentAtPause: skip };
  if (entry.cutoff === undefined) {
    const rows = await db.$queryRaw<{ sentAt: Date }[]>(Prisma.sql`
      SELECT "sentAt" FROM campaign_recipient
      WHERE "campaignId" = ${campaignId} AND status = 'SENT'
      ORDER BY "sentAt" ASC, id ASC
      OFFSET ${Math.max(skip - 1, 0)}::int LIMIT 1`);
    entry.cutoff = skip === 0 ? null : (rows[0]?.sentAt ?? null);
    mem.paused.set(campaignId, entry);
  }
  const after = entry.cutoff ? Prisma.sql`AND "sentAt" > ${ts(entry.cutoff)}` : Prisma.empty;
  const rows = await db.$queryRaw<{ sent: number; hard: number; complaints: number }[]>(Prisma.sql`
    SELECT count(*)::int AS sent,
           count(*) FILTER (WHERE "bounceType" = 'hard')::int AS hard,
           count(*) FILTER (WHERE "complainedAt" IS NOT NULL)::int AS complaints
    FROM campaign_recipient
    WHERE "campaignId" = ${campaignId} AND status = 'SENT' ${after}`);
  return rows[0] ?? { sent: 0, hard: 0, complaints: 0 };
}

/**
 * Copies "sent at the time of the pause" from paused campaigns carrying one
 * of our messages into memory, BEFORE the user resumes (resuming clears the
 * message). That includes a campaign the user paused by hand after resuming.
 */
async function scanAutoPaused(): Promise<Set<string>> {
  const rows = await db.campaign.findMany({
    where: {
      status: "PAUSED",
      OR: [{ lastError: { startsWith: AUTO_PAUSE_PREFIX } }, { lastError: { startsWith: RESUMED_NOTE_PREFIX } }],
    },
    select: { id: true, lastError: true },
    take: 1000,
  });
  const mem = memory();
  for (const r of rows) {
    const n = sentAtPauseFrom(r.lastError);
    if (n !== null && mem.paused.get(r.id)?.sentAtPause !== n) mem.paused.set(r.id, { sentAtPause: n });
  }
  return new Set(rows.map((r) => r.id));
}

/**
 * The worker's hook, run once per tick: checks every SENDING campaign whose
 * sent count changed since the last tick. Never throws (errors are logged),
 * so it can't break the worker. Cheap: two indexed queries, then one
 * primary-key read per campaign that sent something.
 */
export async function runHealthChecks(): Promise<{ checked: number; paused: string[] }> {
  const mem = memory();
  const out = { checked: 0, paused: [] as string[] };
  try {
    const pausedIds = await scanAutoPaused();
    const sending = await db.campaign.findMany({ where: { status: "SENDING" }, select: { id: true, sentCount: true } });

    for (const { id, sentCount } of sending) {
      if (mem.lastSeen.get(id) === sentCount) continue; // nothing new sent
      mem.lastSeen.set(id, sentCount);
      try {
        out.checked++;
        const r = await checkCampaignHealth(id);
        if (r.action === "paused") out.paused.push(id);
      } catch (err) {
        console.error(`[sending health] Check failed for campaign ${id}:`, err instanceof Error ? err.message : err);
      }
    }

    // Forget campaigns that are neither sending nor paused by us (finished,
    // cancelled...), so memory stays small.
    const active = new Set([...sending.map((s) => s.id), ...pausedIds]);
    for (const id of mem.lastSeen.keys()) if (!active.has(id)) mem.lastSeen.delete(id);
    for (const id of mem.paused.keys()) if (!active.has(id)) mem.paused.delete(id);
  } catch (err) {
    console.error("[sending health] Checks failed:", err instanceof Error ? err.message : err);
  }
  return out;
}
