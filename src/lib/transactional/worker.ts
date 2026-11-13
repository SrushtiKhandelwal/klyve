import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { limiterFor } from "@/lib/campaigns/rate-limit";
import { sentToday } from "@/lib/campaigns/send-one";
import { loadProvider, ProviderCredentialsError } from "@/lib/email/stored-provider";
import {
  deliverOne,
  markProviderBroken,
  postponeForDailyLimit,
  releaseEmail,
  retryOrFail,
  type ClaimedEmail,
  type DeliverLane,
  type DeliverOutcome,
  type LaneProvider,
} from "./deliver";
import { TRANSACTIONAL_LIMITS } from "./schema";

// ─────────────────────────────────────────────────────────────────────────────
// The transactional part of the background worker.
//
// src/lib/campaigns/worker.ts calls runTransactionalTick() FIRST in every
// tick (about once a second), so receipts and password resets go out before
// campaign emails. Each call:
//
//   1. stale claims: rows stuck in SENDING for 10+ minutes (the server died
//      mid-send) → FAILED "unknown". NEVER sent again: we can't know whether
//      the provider got it, and a duplicate receipt is worse than a gap.
//   2. orphans: QUEUED rows whose provider was deleted → FAILED.
//   3. lanes: one per provider with due emails. A lane claims a batch
//      (FOR UPDATE SKIP LOCKED, so two workers can never claim the same row),
//      sends it at the provider's speed (the SAME limiter as campaigns, so
//      together they never exceed it), and books each email in
//      provider_daily_usage (shared with campaigns). At the daily cap the
//      emails wait until midnight UTC; that's not a failure.
//   4. retention, once an hour: content (HTML/text) of emails older than
//      30 days is cleared; rows older than 90 days are deleted. In small
//      batches, so it never holds long locks.
//
// It never throws: each part catches and logs its own problems.
// ─────────────────────────────────────────────────────────────────────────────

/** A row in SENDING this long belongs to a worker that crashed. */
const STALE_CLAIM_MS = 10 * 60_000;
/** One lane keeps sending at most this long, then hands back so the next tick re-plans. */
const LANE_MAX_MS = 10_000;
const MAX_BATCH = 50;
const MAX_SENDS_IN_FLIGHT = 10;
const MAX_PARALLEL_LANES = 8;
/** Retention runs this often. */
const RETENTION_EVERY_MS = 60 * 60_000;
/** Rows per retention statement, and statements per run (bounded work per tick). */
const RETENTION_BATCH = 500;
const RETENTION_MAX_BATCHES = 20;

export const STALE_MESSAGE =
  "Delivery status unknown — may or may not have been sent (the server stopped while handing it to the provider). Not retried, to avoid sending it twice.";
const ORPHAN_MESSAGE = "Not sent: the email provider it was going to use was deleted. Send it again to use your current provider.";

// ── State (on globalThis: a development hot reload must not start a second set of lanes) ──

type State = {
  lanes: Map<string, Promise<void>>;
  lastRetentionAt: number;
};
const holder = globalThis as unknown as { klyveTransactionalWorker?: State };
function state(): State {
  holder.klyveTransactionalWorker ??= { lanes: new Map(), lastRetentionAt: 0 };
  return holder.klyveTransactionalWorker;
}

const ts = (d: Date) => Prisma.sql`${d}::timestamp`;

function log(message: string, err?: unknown) {
  if (err === undefined) console.log(`[transactional] ${message}`);
  else console.error(`[transactional] ${message}:`, err instanceof Error ? err.message : err);
}

async function safely<T>(name: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    log(`Step "${name}" failed`, err);
    return fallback;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export type TransactionalTickOptions = {
  /** Wait for the lanes to finish (tests/scripts). The background loop doesn't wait. */
  wait?: boolean;
  /** The worker is shutting down: don't claim more, put claimed rows back. */
  isStopping?: () => boolean;
  /** Only touch this workspace's rows (for tests and scripts). */
  workspaceId?: string;
  /** Run retention now, even if it ran less than an hour ago. */
  forceRetention?: boolean;
};

export type RetentionResult = { contentCleared: number; deleted: number };

export type TransactionalTickSummary = {
  staleFailed: number;
  orphansFailed: number;
  lanesStarted: number;
  /** What happened to each email, when `wait` was set (null otherwise). */
  outcomes: Record<DeliverOutcome, number> | null;
  /** null when retention didn't run this tick. */
  retention: RetentionResult | null;
};

/**
 * Runs the transactional part of one worker tick. `now` lets a test pretend
 * it's later (retries, midnight, retention). Never throws.
 */
export async function runTransactionalTick(now?: Date, opts: TransactionalTickOptions = {}): Promise<TransactionalTickSummary> {
  const t = now ?? new Date();
  const scope = opts.workspaceId ? Prisma.sql`AND "workspaceId" = ${opts.workspaceId}` : Prisma.empty;
  const outcomes = emptyOutcomes();

  const staleFailed = await safely("stale claims", 0, () => failStaleClaims(t, scope));
  const orphansFailed = await safely("orphans", 0, () => failOrphans(t, scope));
  const lanes = await safely("lanes", [] as Promise<void>[], () => startLanes(now, t, opts, scope, outcomes));
  if (opts.wait) await Promise.allSettled(lanes);

  let retention: RetentionResult | null = null;
  const s = state();
  if (opts.forceRetention || t.getTime() - s.lastRetentionAt >= RETENTION_EVERY_MS) {
    s.lastRetentionAt = t.getTime();
    retention = await safely("retention", null, () => runTransactionalRetention(t, { workspaceId: opts.workspaceId }));
  }

  return { staleFailed, orphansFailed, lanesStarted: lanes.length, outcomes: opts.wait ? outcomes : null, retention };
}

/** Lanes still sending (the campaign worker waits for them when it stops). */
export function transactionalWorkInFlight(): Promise<void>[] {
  return [...state().lanes.values()];
}

// ── 1. Stale claims ──────────────────────────────────────────────────────────

async function failStaleClaims(now: Date, scope: Prisma.Sql): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_CLAIM_MS);
  const n = await db.$executeRaw(Prisma.sql`
    UPDATE transactional_email
    SET status = 'FAILED', "lastError" = ${STALE_MESSAGE}, "lockedAt" = NULL, "updatedAt" = ${ts(now)}
    WHERE status = 'SENDING' AND "lockedAt" < ${ts(cutoff)} ${scope}`);
  if (n > 0) log(`Marked ${n} interrupted email(s) as "status unknown"`);
  return n;
}

// ── 2. Orphans ───────────────────────────────────────────────────────────────

async function failOrphans(now: Date, scope: Prisma.Sql): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    UPDATE transactional_email
    SET status = 'FAILED', "lastError" = ${ORPHAN_MESSAGE}, "updatedAt" = ${ts(now)}
    WHERE status = 'QUEUED' AND "providerId" IS NULL ${scope}`);
}

// ── 3. Lanes ─────────────────────────────────────────────────────────────────

function emptyOutcomes(): Record<DeliverOutcome, number> {
  return { sent: 0, retry: 0, failed: 0, suppressed: 0, postponed: 0, released: 0, unknown: 0 };
}

async function startLanes(
  fixedNow: Date | undefined,
  now: Date,
  opts: TransactionalTickOptions,
  scope: Prisma.Sql,
  outcomes: Record<DeliverOutcome, number>,
): Promise<Promise<void>[]> {
  const s = state();
  const providers = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT DISTINCT "providerId" AS id FROM transactional_email
    WHERE status = 'QUEUED' AND "nextAttemptAt" <= ${ts(now)} AND "providerId" IS NOT NULL ${scope}
    LIMIT 100`);

  const started: Promise<void>[] = [];
  for (const { id } of providers) {
    if (s.lanes.size >= MAX_PARALLEL_LANES) break;
    if (s.lanes.has(id)) continue; // already sending through this provider
    const lane = runLane(id, fixedNow, opts, outcomes)
      .catch((err) => log(`Lane for provider ${id} failed`, err))
      .finally(() => s.lanes.delete(id));
    s.lanes.set(id, lane);
    started.push(lane);
  }
  return started;
}

async function runLane(
  providerId: string,
  fixedNow: Date | undefined,
  opts: TransactionalTickOptions,
  outcomes: Record<DeliverOutcome, number>,
): Promise<void> {
  const clock = () => fixedNow ?? new Date();
  const isStopping = opts.isStopping ?? (() => false);
  const row = await db.sendingProvider.findUnique({
    where: { id: providerId },
    select: { id: true, workspaceId: true, name: true, status: true, maxPerSecond: true, dailyLimit: true },
  });
  if (!row) return; // deleted: its emails become orphans (providerId is set to NULL)
  if (opts.workspaceId && row.workspaceId !== opts.workspaceId) return;

  const provider: LaneProvider = { id: row.id, workspaceId: row.workspaceId, name: row.name, status: row.status, dailyLimit: row.dailyLimit };
  const limiter = limiterFor(row.id, row.maxPerSecond);
  let lane: DeliverLane | null = null;
  const startedAt = Date.now();

  while (!isStopping() && Date.now() - startedAt < LANE_MAX_MS) {
    const now = clock();

    // Daily cap (shared with campaigns): how many may still go out today?
    let batchSize = Math.min(MAX_BATCH, limiter.rate);
    if (provider.dailyLimit !== null) {
      const left = provider.dailyLimit - (await sentToday(provider.id, now));
      if (left <= 0) {
        await postponeForDailyLimit(provider, now);
        return;
      }
      batchSize = Math.min(batchSize, left);
    }

    const claimed = await claimBatch(provider, batchSize, now);
    if (claimed.length === 0) return;

    // Credentials are decrypted once per lane, and only when there is something to send.
    if (!lane) {
      let loaded: Awaited<ReturnType<typeof loadProvider>>;
      try {
        loaded = await loadProvider(provider.workspaceId, provider.id);
      } catch (err) {
        if (err instanceof ProviderCredentialsError) {
          // Unreadable credentials: a provider problem, handled like any other
          // (each email uses one try; the settings page shows the reason).
          await markProviderBroken(provider, err.message);
          for (const r of claimed) count(outcomes, await retryOrFail(r, err.message, clock()));
          return;
        }
        await Promise.all(claimed.map((r) => releaseEmail(r.id)));
        throw err;
      }
      if (!loaded) {
        await Promise.all(claimed.map((r) => releaseEmail(r.id)));
        return;
      }
      lane = { provider, credentials: loaded.credentials, limiter, now: clock, isStopping, halt: null };
    }

    await sendBatch(lane, claimed, outcomes);
    if (lane.halt) return; // provider problem or daily cap: the next tick decides again
  }
}

function count(outcomes: Record<DeliverOutcome, number>, outcome: DeliverOutcome) {
  outcomes[outcome]++;
}

/** A few emails in flight at once; the rate limiter keeps the pace. */
async function sendBatch(lane: DeliverLane, rows: ClaimedEmail[], outcomes: Record<DeliverOutcome, number>): Promise<void> {
  let next = 0;
  const inFlight = Math.max(1, Math.min(MAX_SENDS_IN_FLIGHT, lane.limiter.rate, rows.length));
  await Promise.all(
    Array.from({ length: inFlight }, async () => {
      while (next < rows.length) {
        const r = rows[next++];
        count(outcomes, await deliverOne(lane, r));
      }
    }),
  );
}

/**
 * The heart of "never twice": the inner SELECT locks the rows it picks and
 * SKIPS rows another worker has locked, and the UPDATE flips them to SENDING
 * in the same statement. A row can only be returned to one worker.
 * The workspace filter is a second guard: a lane only ever sends its own
 * provider's workspace's emails.
 */
function claimBatch(provider: LaneProvider, limit: number, now: Date): Promise<ClaimedEmail[]> {
  return db.$queryRaw<ClaimedEmail[]>(Prisma.sql`
    UPDATE transactional_email
    SET status = 'SENDING', "lockedAt" = ${ts(now)}, "updatedAt" = ${ts(now)}
    WHERE id IN (
      SELECT id FROM transactional_email
      WHERE "providerId" = ${provider.id} AND "workspaceId" = ${provider.workspaceId}
        AND status = 'QUEUED' AND "nextAttemptAt" <= ${ts(now)}
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
      LIMIT ${limit}::int
      FOR UPDATE SKIP LOCKED
    ) AND status = 'QUEUED'
    RETURNING id, "workspaceId", "providerId", "senderId", "toEmail", "toName", "fromEmail", "fromName",
              "replyTo", subject, html, text, attempts`);
}

// ── 4. Retention ─────────────────────────────────────────────────────────────

/**
 * Clears the content of old emails and deletes very old rows, in bounded
 * batches. Emails still waiting to be sent (QUEUED/SENDING) are never touched.
 */
export async function runTransactionalRetention(now: Date = new Date(), opts: { workspaceId?: string } = {}): Promise<RetentionResult> {
  const scope = opts.workspaceId ? Prisma.sql`AND "workspaceId" = ${opts.workspaceId}` : Prisma.empty;
  const day = 86_400_000;
  const clearBefore = new Date(now.getTime() - TRANSACTIONAL_LIMITS.contentRetentionDays * day);
  const deleteBefore = new Date(now.getTime() - TRANSACTIONAL_LIMITS.logRetentionDays * day);

  let deleted = 0;
  for (let i = 0; i < RETENTION_MAX_BATCHES; i++) {
    const n = await db.$executeRaw(Prisma.sql`
      DELETE FROM transactional_email WHERE id IN (
        SELECT id FROM transactional_email
        WHERE "createdAt" < ${ts(deleteBefore)} AND status NOT IN ('QUEUED', 'SENDING') ${scope}
        LIMIT ${RETENTION_BATCH}::int)`);
    deleted += n;
    if (n < RETENTION_BATCH) break;
  }

  let contentCleared = 0;
  for (let i = 0; i < RETENTION_MAX_BATCHES; i++) {
    const n = await db.$executeRaw(Prisma.sql`
      UPDATE transactional_email SET html = '', text = ''
      WHERE id IN (
        SELECT id FROM transactional_email
        WHERE "createdAt" < ${ts(clearBefore)} AND (html <> '' OR text <> '')
          AND status NOT IN ('QUEUED', 'SENDING') ${scope}
        LIMIT ${RETENTION_BATCH}::int)`);
    contentCleared += n;
    if (n < RETENTION_BATCH) break;
  }

  if (deleted || contentCleared) log(`Retention: cleared content of ${contentCleared} email(s), deleted ${deleted} old log row(s)`);
  return { contentCleared, deleted };
}
