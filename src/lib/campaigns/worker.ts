import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { materializeRecipients } from "@/lib/campaigns/launch";
import { limiterFor } from "@/lib/campaigns/rate-limit";
import {
  deferForDailyLimit,
  nextUtcMidnight,
  pauseForBrokenProvider,
  releaseRecipient,
  sendOne,
  sentToday,
  type ClaimedRecipient,
  type LaneContext,
  type LaneProvider,
} from "@/lib/campaigns/send-one";
import { loadProvider, ProviderCredentialsError } from "@/lib/email/stored-provider";

// ─────────────────────────────────────────────────────────────────────────────
// The campaign sending worker: the engine that actually delivers campaigns.
//
// It runs in the background inside the server process (started from
// src/instrumentation.ts) and "ticks" about once a second. Each tick:
//
//   1. starts SCHEDULED campaigns whose time has come
//   2. cleans up emails stuck in SENDING after a crash ("status unknown")
//   3. pauses campaigns whose provider was deleted
//   4. starts one "lane" per sending provider: a lane claims a batch of
//      queued emails and sends them at the provider's speed (see below)
//   5. marks campaigns with nothing left to send as SENT
//
// THE GUARANTEES, and how each one is kept
//
//  • Never the same email twice. The database has ONE row per (campaign,
//    contact). A row is "claimed" by flipping PENDING → SENDING with
//    `FOR UPDATE SKIP LOCKED`, so two workers can never claim the same row.
//    A row that was handed to the provider is never put back in the queue:
//    if the server dies mid-send, the row stays SENDING and step 2 later
//    marks it FAILED ("status unknown") rather than risk a duplicate.
//  • Speed limit. One evenly-spaced rate limiter per provider (rate-limit.ts).
//  • Daily cap. One slot of `ProviderDailyUsage` is booked atomically before
//    each send (given back if it fails). At the cap, the queue waits until
//    midnight UTC and the campaign shows a note.
//  • Retries. Temporary failures wait 1 min, 5 min, 30 min, 2 h, then FAILED.
//  • Survives restarts. All state lives in the database; memory only holds
//    caches and the speed limiters.
//  • Stops promptly. Each email re-reads the campaign's status just before
//    sending, so pause/cancel take effect within about a second.
//  • Unsubscribes honoured. Each email re-reads the contact just before
//    sending; anyone no longer SUBSCRIBED is SKIPPED.
//  • Fairness. Each provider has its own lane (a slow or broken provider
//    can't hold up other workspaces), and inside a lane the batch is shared
//    round-robin between that provider's campaigns.
//
// MULTIPLE WORKERS: claiming, the daily cap and all status changes are safe
// with several worker processes. The speed limit is per process, though, so
// N workers could send up to N × maxPerSecond. Run ONE worker unless you
// add a shared limiter (see rate-limit.ts).
// ─────────────────────────────────────────────────────────────────────────────

/** Pause between ticks. */
const TICK_MS = 1_000;
/** A claimed row older than this is assumed to belong to a crashed worker. */
const STALE_CLAIM_MS = 10 * 60_000;
/** A SENDING campaign without any recipient rows this long after starting gets its recipients created again. */
const REMATERIALIZE_AFTER_MS = 2 * 60_000;
/** One lane keeps sending at most this long, then hands back so the next tick re-plans. */
const LANE_MAX_MS = 10_000;
/** After "can't reach the provider", wait this long before trying it again. */
const UNREACHABLE_COOLDOWN_MS = 30_000;
/** Upper limits per batch and per lane, to keep database work and connections bounded. */
const MAX_BATCH = 100;
const MAX_SENDS_IN_FLIGHT = 10;
const MAX_PARALLEL_LANES = 8;

export const STALE_CLAIM_MESSAGE = "Delivery status unknown (server restarted mid-send); not retried to avoid a duplicate.";

// ── State (kept on globalThis: development hot reloads must not start a second worker) ──

type WorkerState = {
  running: boolean;
  stopping: boolean;
  loop: Promise<void> | null;
  wake: (() => void) | null;
  /** Ticks run one after another, never two at once. */
  tickChain: Promise<unknown>;
  /** At most one lane per provider in this process. */
  lanes: Map<string, Promise<void>>;
  /** Provider id → time (ms) before which we don't try it ("can't reach it" / daily cap). */
  waitUntil: Map<string, number>;
  /** Rotating start positions, so every provider and campaign gets its turn first. */
  laneOffset: number;
  campaignOffset: Map<string, number>;
  signalsHooked: boolean;
};

const holder = globalThis as unknown as { klyveCampaignWorker?: WorkerState };

function state(): WorkerState {
  holder.klyveCampaignWorker ??= {
    running: false,
    stopping: false,
    loop: null,
    wake: null,
    tickChain: Promise.resolve(),
    lanes: new Map(),
    waitUntil: new Map(),
    laneOffset: 0,
    campaignOffset: new Map(),
    signalsHooked: false,
  };
  return holder.klyveCampaignWorker;
}

const ts = (d: Date) => Prisma.sql`${d}::timestamp`;

function log(message: string, err?: unknown) {
  if (err === undefined) console.log(`[campaign worker] ${message}`);
  else console.error(`[campaign worker] ${message}:`, err instanceof Error ? err.message : err);
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Starts the background loop. Safe to call twice (the second call does nothing). Returns true if it started. */
export function startCampaignWorker(): boolean {
  const s = state();
  if (s.running) return false;
  s.running = true;
  s.stopping = false;
  s.loop = (async () => {
    while (!s.stopping) {
      try {
        await serialized(() => tick(undefined, false));
      } catch (err) {
        log("Tick failed (will try again)", err); // never let one bad tick kill the loop
      }
      if (s.stopping) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, TICK_MS);
        s.wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      s.wake = null;
    }
  })();
  hookShutdownSignals(s);
  log("started");
  return true;
}

/**
 * Stops the loop and waits (up to ~20 s) for emails being sent right now.
 * Claimed emails that weren't sent yet go back to the queue.
 */
export async function stopCampaignWorker(): Promise<void> {
  const s = state();
  s.stopping = true;
  s.wake?.();
  const pending = [s.loop, s.tickChain, ...s.lanes.values()].filter(Boolean);
  await Promise.race([
    Promise.allSettled(pending),
    new Promise((resolve) => setTimeout(resolve, 20_000).unref?.()),
  ]);
  s.running = false;
  s.loop = null;
  log("stopped");
}

export type TickSummary = {
  scheduledStarted: number;
  staleFailed: number;
  lanesRun: number;
  completed: number;
};

/**
 * Runs ONE tick and waits for its sending to finish. For tests and scripts;
 * the background loop calls the same code. `now` lets a test pretend it's
 * later (e.g. to make a retry or tomorrow's daily allowance due).
 */
export async function runWorkerTick(now?: Date): Promise<TickSummary> {
  state().stopping = false;
  return serialized(() => tick(now, true));
}

// ── The tick ─────────────────────────────────────────────────────────────────

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const s = state();
  const run = s.tickChain.then(fn, fn);
  s.tickChain = run.catch(() => {});
  return run;
}

async function step<T>(name: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    log(`Step "${name}" failed`, err); // each step is independent: one failing doesn't block the rest
    return fallback;
  }
}

async function tick(fixedNow: Date | undefined, waitForLanes: boolean): Promise<TickSummary> {
  const now = fixedNow ?? new Date();
  const scheduledStarted = await step("start scheduled", 0, () => startDueCampaigns(now));
  const staleFailed = await step("stale claims", 0, () => failStaleClaims(now));
  await step("orphans", undefined, () => pauseCampaignsWithoutProvider());
  await step("rematerialize", undefined, () => rematerializeEmptyCampaigns(now));
  const lanes = await step("lanes", [] as Promise<void>[], () => startLanes(fixedNow, now));
  if (waitForLanes) await Promise.allSettled(lanes);
  const completed = await step("completion", 0, () => completeFinishedCampaigns(fixedNow ?? new Date()));
  return { scheduledStarted, staleFailed, lanesRun: lanes.length, completed };
}

// 1. Scheduled campaigns whose time has come → SENDING, then create their recipient rows.
async function startDueCampaigns(now: Date): Promise<number> {
  const due = await db.campaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });
  let started = 0;
  for (const { id } of due) {
    // Conditional update: if two workers race, only one flips it.
    const flipped = await db.campaign.updateMany({
      where: { id, status: "SCHEDULED" },
      data: { status: "SENDING", startedAt: now, lastError: null },
    });
    if (flipped.count === 0) continue;
    started++;
    try {
      const count = await materializeRecipients(id);
      log(`Scheduled campaign ${id} started with ${count} recipient(s)`);
    } catch (err) {
      // Left SENDING with no rows: step 4 below retries the materialization later.
      log(`Couldn't create recipients for campaign ${id}`, err);
    }
  }
  return started;
}

// 2. Crash recovery: SENDING rows nobody finished. We can't know if the
//    provider got the email, so FAILED ("unknown") — never back to PENDING.
async function failStaleClaims(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_CLAIM_MS);
  const rows = await db.$queryRaw<{ n: number }[]>(Prisma.sql`
    WITH stale AS (
      UPDATE campaign_recipient
      SET status = 'FAILED', "lastError" = ${STALE_CLAIM_MESSAGE}, "lockedAt" = NULL
      WHERE status = 'SENDING' AND "lockedAt" < ${ts(cutoff)}
      RETURNING "campaignId"
    ), per_campaign AS (
      SELECT "campaignId", count(*)::int AS n FROM stale GROUP BY "campaignId"
    ), bump AS (
      UPDATE campaign c SET "failedCount" = c."failedCount" + p.n
      FROM per_campaign p WHERE c.id = p."campaignId"
    )
    SELECT COALESCE(sum(n), 0)::int AS n FROM per_campaign`);
  const n = rows[0]?.n ?? 0;
  if (n > 0) log(`Marked ${n} interrupted email(s) as "status unknown"`);
  return n;
}

// 3. A SENDING campaign whose provider was deleted can't continue.
async function pauseCampaignsWithoutProvider(): Promise<void> {
  await db.campaign.updateMany({
    where: { status: "SENDING", providerId: null },
    data: {
      status: "PAUSED",
      lastError: "The email provider this campaign was using was deleted. Add a provider in Settings → Sending providers, then resume.",
    },
  });
}

// 4. A campaign flipped to SENDING whose recipients were never (fully)
//    created, e.g. the server stopped in between. launch.ts sets
//    recipientCount only when materializing has FINISHED, so "SENDING with
//    recipientCount 0" means "not done". materializeRecipients is idempotent.
async function rematerializeEmptyCampaigns(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - REMATERIALIZE_AFTER_MS);
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM campaign
    WHERE status = 'SENDING' AND "recipientCount" = 0
      AND ("startedAt" IS NULL OR "startedAt" < ${ts(cutoff)})
    LIMIT 10`);
  for (const { id } of rows) {
    try {
      await materializeRecipients(id);
    } catch (err) {
      log(`Couldn't create recipients for campaign ${id}`, err);
    }
  }
}

// 5. Every recipient processed → SENT, with counters recounted from the rows.
async function completeFinishedCampaigns(now: Date): Promise<number> {
  const candidates = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT c.id FROM campaign c
    WHERE c.status = 'SENDING'
      AND c."recipientCount" > 0 -- 0 = recipients still being created (see step 4)
      AND NOT EXISTS (
        SELECT 1 FROM campaign_recipient r
        WHERE r."campaignId" = c.id AND r.status IN ('PENDING', 'SENDING'))
    LIMIT 50`);

  let completed = 0;
  for (const { id } of candidates) {
    const groups = await db.campaignRecipient.groupBy({ by: ["status"], where: { campaignId: id }, _count: { _all: true } });
    const count = (status: string) => groups.find((g) => g.status === status)?._count._all ?? 0;
    const sent = count("SENT");
    const failed = count("FAILED");
    const skipped = count("SKIPPED");
    const total = groups.reduce((sum, g) => sum + g._count._all, 0);

    // Nothing delivered at all, and something went wrong → FAILED, with the reason.
    let finalStatus: "SENT" | "FAILED" = "SENT";
    let lastError: string | null = null;
    if (sent === 0 && failed > 0) {
      finalStatus = "FAILED";
      const example = await db.campaignRecipient.findFirst({
        where: { campaignId: id, status: "FAILED" },
        select: { lastError: true },
      });
      lastError = `None of the ${failed} email${failed === 1 ? "" : "s"} could be delivered.${example?.lastError ? ` For example: ${example.lastError}` : ""}`;
    }

    // The NOT EXISTS is repeated in the UPDATE so a row that was put back in
    // the queue a moment ago can't let the campaign finish early.
    const changed = await db.$executeRaw(Prisma.sql`
      UPDATE campaign
      SET status = ${finalStatus}::"CampaignStatus", "finishedAt" = ${ts(now)}, "updatedAt" = ${ts(now)},
          "recipientCount" = ${total}::int, "sentCount" = ${sent}::int,
          "failedCount" = ${failed}::int, "skippedCount" = ${skipped}::int, "lastError" = ${lastError}
      WHERE id = ${id} AND status = 'SENDING' AND "recipientCount" > 0
        AND NOT EXISTS (
          SELECT 1 FROM campaign_recipient r
          WHERE r."campaignId" = ${id} AND r.status IN ('PENDING', 'SENDING'))`);
    if (changed > 0) {
      completed++;
      log(`Campaign ${id} finished: ${sent} sent, ${failed} failed, ${skipped} skipped`);
    }
  }
  return completed;
}

// ── Lanes: one per provider ──────────────────────────────────────────────────

/** Starts a lane for each provider with sending campaigns (that isn't busy or waiting). */
async function startLanes(fixedNow: Date | undefined, now: Date): Promise<Promise<void>[]> {
  const s = state();
  const providers = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT DISTINCT "providerId" AS id FROM campaign
    WHERE status = 'SENDING' AND "providerId" IS NOT NULL
    ORDER BY id`);
  if (providers.length === 0) return [];

  // Rotate the starting point so, with many providers, everyone gets a turn.
  const offset = s.laneOffset++ % providers.length;
  const ordered = [...providers.slice(offset), ...providers.slice(0, offset)];

  const started: Promise<void>[] = [];
  for (const { id } of ordered) {
    if (s.lanes.size >= MAX_PARALLEL_LANES) break;
    if (s.lanes.has(id)) continue;
    if ((s.waitUntil.get(id) ?? 0) > now.getTime()) continue;
    const lane = runLane(id, fixedNow)
      .catch((err) => log(`Lane for provider ${id} failed`, err))
      .finally(() => s.lanes.delete(id));
    s.lanes.set(id, lane);
    started.push(lane);
  }
  return started;
}

/**
 * Sends through ONE provider: claim a batch (about one second's worth),
 * send it at the provider's speed, repeat, for up to LANE_MAX_MS.
 */
async function runLane(providerId: string, fixedNow: Date | undefined): Promise<void> {
  const s = state();
  const clock = () => fixedNow ?? new Date();
  const row = await db.sendingProvider.findUnique({
    where: { id: providerId },
    select: { id: true, workspaceId: true, name: true, status: true, maxPerSecond: true, dailyLimit: true },
  });
  if (!row) return; // deleted: its campaigns get paused by the "orphans" step

  const provider: LaneProvider = { id: row.id, workspaceId: row.workspaceId, name: row.name, status: row.status, dailyLimit: row.dailyLimit };
  const limiter = limiterFor(row.id, row.maxPerSecond);
  let ctx: LaneContext | null = null;
  const startedAt = Date.now();

  while (!s.stopping && Date.now() - startedAt < LANE_MAX_MS) {
    const now = clock();

    // Daily cap: how many may we still send today?
    let batchSize = Math.min(MAX_BATCH, limiter.rate);
    if (provider.dailyLimit !== null) {
      const left = provider.dailyLimit - (await sentToday(provider.id, now));
      if (left <= 0) {
        await deferForDailyLimit(provider, now);
        s.waitUntil.set(provider.id, nextUtcMidnight(now).getTime());
        return;
      }
      batchSize = Math.min(batchSize, left);
    }

    const claimed = await claimBatch(provider.id, batchSize, now);
    if (claimed.length === 0) return;

    // Credentials are decrypted once per lane, and only when there is something to send.
    if (!ctx) {
      let loaded: Awaited<ReturnType<typeof loadProvider>>;
      try {
        loaded = await loadProvider(provider.workspaceId, provider.id);
      } catch (err) {
        await Promise.all(claimed.map((r) => releaseRecipient(r.id)));
        if (err instanceof ProviderCredentialsError) {
          await pauseForBrokenProvider(provider, err.message);
          return;
        }
        throw err;
      }
      if (!loaded) {
        await Promise.all(claimed.map((r) => releaseRecipient(r.id)));
        return;
      }
      ctx = {
        provider,
        credentials: loaded.credentials,
        limiter,
        now: clock,
        isStopping: () => s.stopping,
        halt: null,
      };
    }

    await sendBatch(ctx, claimed);

    if (ctx.halt === "provider-unreachable") {
      s.waitUntil.set(provider.id, clock().getTime() + UNREACHABLE_COOLDOWN_MS);
      return;
    }
    if (ctx.halt === "daily-limit") {
      s.waitUntil.set(provider.id, nextUtcMidnight(clock()).getTime());
      return;
    }
    if (ctx.halt) return; // provider broken: its campaigns are paused now
  }
}

/** Sends a batch with a few emails in flight at once; the rate limiter keeps the pace. */
async function sendBatch(ctx: LaneContext, rows: ClaimedRecipient[]): Promise<void> {
  let next = 0;
  const inFlight = Math.max(1, Math.min(MAX_SENDS_IN_FLIGHT, ctx.limiter.rate, rows.length));
  await Promise.all(
    Array.from({ length: inFlight }, async () => {
      while (next < rows.length) {
        const r = rows[next++];
        await sendOne(ctx, r);
      }
    }),
  );
}

/**
 * Claims up to `limit` due emails of this provider's SENDING campaigns,
 * shared round-robin between the campaigns so a huge campaign can't starve
 * a small one. Returns them interleaved (A, B, C, A, B, C, ...).
 */
async function claimBatch(providerId: string, limit: number, now: Date): Promise<ClaimedRecipient[]> {
  const s = state();
  const campaigns = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM campaign
    WHERE status = 'SENDING' AND "providerId" = ${providerId}
    ORDER BY "startedAt" ASC NULLS LAST, id`);
  if (campaigns.length === 0) return [];

  const offset = (s.campaignOffset.get(providerId) ?? 0) % campaigns.length;
  s.campaignOffset.set(providerId, offset + 1);
  const ordered = [...campaigns.slice(offset), ...campaigns.slice(0, offset)];

  const perCampaign = Math.max(1, Math.ceil(limit / ordered.length));
  const groups: ClaimedRecipient[][] = [];
  let left = limit;
  for (const { id } of ordered) {
    if (left <= 0) break;
    const rows = await claimFromCampaign(id, Math.min(perCampaign, left), now);
    left -= rows.length;
    if (rows.length) groups.push(rows);
  }

  // Interleave so a pause of one campaign doesn't delay the others in the batch.
  const out: ClaimedRecipient[] = [];
  for (let i = 0; out.length < limit - left; i++) {
    for (const g of groups) if (g[i]) out.push(g[i]);
  }
  return out;
}

/**
 * The heart of "never twice": the inner SELECT locks the rows it picks and
 * SKIPS rows another worker has locked, and the UPDATE flips them to
 * SENDING in the same statement. A row can only be returned to one worker.
 */
function claimFromCampaign(campaignId: string, limit: number, now: Date): Promise<ClaimedRecipient[]> {
  return db.$queryRaw<ClaimedRecipient[]>(Prisma.sql`
    UPDATE campaign_recipient
    SET status = 'SENDING', "lockedAt" = ${ts(now)}
    WHERE id IN (
      SELECT id FROM campaign_recipient
      WHERE "campaignId" = ${campaignId} AND status = 'PENDING' AND "nextAttemptAt" <= ${ts(now)}
      LIMIT ${limit}::int
      FOR UPDATE SKIP LOCKED
    ) AND status = 'PENDING'
    RETURNING id, "campaignId", "contactId", email, attempts`);
}

// ── Shutdown ─────────────────────────────────────────────────────────────────

/**
 * On Ctrl+C / SIGTERM: stop claiming new emails and put claimed-but-unsent
 * ones back. Next.js exits the process itself; if nobody else handles the
 * signal (e.g. a dedicated worker process), we exit after stopping.
 */
function hookShutdownSignals(s: WorkerState) {
  if (s.signalsHooked || typeof process === "undefined" || typeof process.on !== "function") return;
  s.signalsHooked = true;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      const othersHandleExit = process.listenerCount(signal) > 1;
      void stopCampaignWorker().finally(() => {
        if (!othersHandleExit) process.exit(signal === "SIGINT" ? 130 : 143);
      });
    });
  }
}
