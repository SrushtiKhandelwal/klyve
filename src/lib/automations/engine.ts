import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { findStep, stepsSchema, triggerSchema, type AutomationStep, type AutomationTrigger } from "@/lib/automations/schema";
import { executeStep, type LogEntry, type StepContext } from "@/lib/automations/steps";
import { isSuppressed } from "@/lib/suppression";

// ─────────────────────────────────────────────────────────────────────────────
// The automation engine: moves each person (an AutomationRun) through the
// steps. The campaign worker calls runAutomationTick() every tick.
//
//   1. release "stale" claims: runs a crashed worker was holding (> 10 min)
//   2. CLAIM due runs (ACTIVE, or WAITING whose time has come) of ACTIVE
//      automations, fairly shared between automations
//   3. for each claimed run, do steps until it has to wait or reaches the end
//      (at most 20 steps per run per tick)
//
// THE GUARANTEES, and how each one is kept
//  • One worker per run. A run is claimed by setting `lockedAt` with
//    FOR UPDATE SKIP LOCKED + "lockedAt IS NULL", so two ticks (or two
//    servers) never get the same run. Every later write says
//    "WHERE lockedAt = <my claim>", so a worker that lost its claim (it was
//    stuck > 10 min and the claim was released) can't overwrite anything.
//  • Never the same email twice. Sending = adding ONE CampaignRecipient row,
//    unique per (campaign, contact), with ON CONFLICT DO NOTHING (emails.ts).
//    Repeating a step after a crash can't queue a second email.
//  • Never to unsubscribed / suppressed people. Checked when a run is picked
//    up (they EXIT), again inside the INSERT that queues the email, and once
//    more by the worker right before sending.
//  • Survives restarts. Progress is saved after EVERY step; memory holds
//    nothing that matters. A run interrupted mid-step repeats that step,
//    which is safe because every step is idempotent (steps.ts).
//  • Workspaces stay apart. A run's contact must be in its automation's
//    workspace, and every step's query filters by that workspace.
//  • No runaway loops. Steps are a tree (no step can lead back to an earlier
//    one), a run does at most 20 steps per tick, and a repeated step id in
//    one go is treated as a bug (FAILED) instead of looping.
//  • Pause works at once. Claims only pick ACTIVE automations, and before
//    each further step we re-check that the automation is still ACTIVE.
//  • One broken run never breaks the tick: errors mark that run FAILED (with
//    lastError + an "error" log) and the tick carries on.
// ─────────────────────────────────────────────────────────────────────────────

/** A claim older than this belongs to a crashed/stuck worker and is released. */
export const STALE_RUN_CLAIM_MS = 10 * 60_000;
/** Loop guard: most steps one run may do in one tick. */
export const MAX_STEPS_PER_TICK = 20;
/** Runs claimed per batch, and at most this many per automation per batch (fairness). */
const CLAIM_BATCH = 100;
const PER_AUTOMATION = 25;
/** Runs processed at the same time. */
const PARALLEL_RUNS = 5;
/** One tick keeps claiming batches for at most this long, then hands back to the worker. */
const TICK_BUDGET_MS = 3_000;

const ts = (d: Date) => Prisma.sql`${d}::timestamp`;

function log(message: string, err?: unknown) {
  if (err === undefined) console.log(`[automations] ${message}`);
  else console.error(`[automations] ${message}:`, err instanceof Error ? err.message : err);
}

export type AutomationTickSummary = {
  released: number;
  claimed: number;
  completed: number;
  exited: number;
  failed: number;
  waiting: number;
};

export type AutomationTickOptions = {
  /** Tests: only runs of these workspaces' automations. */
  workspaceIds?: string[];
  /** Tests: claim at most this many batches (default: until done or the time budget is used). */
  maxBatches?: number;
};

type ClaimedRun = {
  id: string;
  automationId: string;
  contactId: string | null;
  status: "ACTIVE" | "WAITING";
  currentStepId: string | null;
  occurrence: string | null;
  lockedAt: Date;
};

type LoadedAutomation = {
  id: string;
  workspaceId: string;
  name: string;
  status: string;
  createdById: string | null;
  trigger: AutomationTrigger | null;
  steps: AutomationStep[] | null;
};

// ── The tick ─────────────────────────────────────────────────────────────────

/**
 * Advances every due run (bounded by a time budget). `now` lets tests pretend
 * it's later (e.g. to finish a wait). Never throws.
 */
export async function runAutomationTick(now: Date = new Date(), options: AutomationTickOptions = {}): Promise<AutomationTickSummary> {
  const summary: AutomationTickSummary = { released: 0, claimed: 0, completed: 0, exited: 0, failed: 0, waiting: 0 };
  const scope = options.workspaceIds ? Prisma.sql`AND a."workspaceId" = ANY(${options.workspaceIds}::text[])` : Prisma.empty;
  try {
    summary.released = await releaseStaleClaims(now, scope);
  } catch (err) {
    log("Releasing stale claims failed", err);
  }

  const started = Date.now();
  const cache = new Map<string, Promise<LoadedAutomation | null>>();
  for (let batch = 0; options.maxBatches === undefined || batch < options.maxBatches; batch++) {
    if (Date.now() - started > TICK_BUDGET_MS) break;
    let claimed: ClaimedRun[];
    try {
      claimed = await claimDueRuns(now, scope);
    } catch (err) {
      log("Claiming runs failed", err);
      break;
    }
    if (claimed.length === 0) break;
    summary.claimed += claimed.length;

    // A few at a time: fast, without flooding the database connection pool.
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(PARALLEL_RUNS, claimed.length) }, async () => {
        while (next < claimed.length) {
          const run = claimed[next++];
          await processRun(run, now, cache, summary);
        }
      }),
    );
  }
  return summary;
}

/**
 * Crash recovery: a claim older than 10 minutes means the worker holding it
 * died. The run goes back in the queue (status unchanged: a WAITING run
 * that was due is still due). Repeating its current step is safe.
 */
async function releaseStaleClaims(now: Date, scope: Prisma.Sql): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_RUN_CLAIM_MS);
  const n = await db.$executeRaw(Prisma.sql`
    UPDATE automation_run r SET "lockedAt" = NULL
    FROM automation a
    WHERE a.id = r."automationId" ${scope}
      AND r."lockedAt" < ${ts(cutoff)} AND r.status IN ('ACTIVE', 'WAITING')`);
  if (n > 0) log(`Released ${n} stale automation run claim(s)`);
  return n;
}

/**
 * Claims up to CLAIM_BATCH due runs, at most PER_AUTOMATION per automation,
 * taking each automation's oldest first and interleaving automations (a big
 * automation can't starve a small one). FOR UPDATE SKIP LOCKED + the
 * "lockedAt IS NULL" re-check make a run claimable by one worker only.
 */
async function claimDueRuns(now: Date, scope: Prisma.Sql): Promise<ClaimedRun[]> {
  return db.$queryRaw<ClaimedRun[]>(Prisma.sql`
    WITH due AS (
      SELECT r.id, r."automationId", r."nextRunAt"
      FROM automation_run r
      JOIN automation a ON a.id = r."automationId"
      WHERE a.status = 'ACTIVE'::"AutomationStatus" ${scope}
        AND r.status IN ('ACTIVE', 'WAITING') AND r."nextRunAt" <= ${ts(now)} AND r."lockedAt" IS NULL
      ORDER BY r."nextRunAt", r.id
      LIMIT 5000
    ), ranked AS (
      SELECT id, row_number() OVER (PARTITION BY "automationId" ORDER BY "nextRunAt", id) AS rn FROM due
    ), pick AS (
      SELECT r.id FROM automation_run r
      JOIN ranked k ON k.id = r.id
      WHERE k.rn <= ${PER_AUTOMATION}::int
      ORDER BY k.rn, r."nextRunAt", r.id
      LIMIT ${CLAIM_BATCH}::int
      FOR UPDATE OF r SKIP LOCKED
    )
    UPDATE automation_run SET "lockedAt" = ${ts(now)}
    WHERE id IN (SELECT id FROM pick) AND "lockedAt" IS NULL AND status IN ('ACTIVE', 'WAITING')
    RETURNING id, "automationId", "contactId", status::text AS status, "currentStepId", occurrence, "lockedAt"`);
}

// ── Saving progress (every write is guarded by our claim) ───────────────────

/** Moves the run to `stepId` with `status`; `release` lets go of the claim. False = we lost the claim. */
async function saveProgress(
  run: ClaimedRun,
  stepId: string | null,
  status: "ACTIVE" | "WAITING",
  nextRunAt: Date,
  release: boolean,
): Promise<boolean> {
  const n = await db.$executeRaw(Prisma.sql`
    UPDATE automation_run
    SET "currentStepId" = ${stepId}, status = ${status}::"AutomationRunStatus", "nextRunAt" = ${ts(nextRunAt)},
        "lockedAt" = CASE WHEN ${release} THEN NULL ELSE "lockedAt" END
    WHERE id = ${run.id} AND "lockedAt" = ${ts(run.lockedAt)} AND status IN ('ACTIVE', 'WAITING')`);
  return n > 0;
}

/** Lets go of the claim without changing anything (e.g. the automation was paused). */
async function release(run: ClaimedRun): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE automation_run SET "lockedAt" = NULL WHERE id = ${run.id} AND "lockedAt" = ${ts(run.lockedAt)}`);
}

/**
 * Ends the run. COMPLETED also bumps the automation's completedCount, in the
 * same statement and only if the run really changed (so never twice).
 * Raw SQL on purpose: the automation's `updatedAt` must not change (the
 * builder and activation use it to detect edits).
 */
async function finish(
  run: ClaimedRun,
  status: "COMPLETED" | "EXITED" | "FAILED",
  stepId: string | null,
  now: Date,
  lastError: string | null,
): Promise<boolean> {
  const update = Prisma.sql`
    UPDATE automation_run
    SET status = ${status}::"AutomationRunStatus", "currentStepId" = ${stepId}, "finishedAt" = ${ts(now)},
        "lockedAt" = NULL, "lastError" = ${lastError}
    WHERE id = ${run.id} AND "lockedAt" = ${ts(run.lockedAt)} AND status IN ('ACTIVE', 'WAITING')
    RETURNING "automationId"`;
  if (status !== "COMPLETED") return (await db.$queryRaw<unknown[]>(update)).length > 0;
  const rows = await db.$queryRaw<unknown[]>(Prisma.sql`
    WITH done AS (${update})
    UPDATE automation a SET "completedCount" = a."completedCount" + 1
    FROM done WHERE a.id = done."automationId"
    RETURNING a.id`);
  return rows.length > 0;
}

/**
 * A run's history is read in `createdAt` order, but many steps can run in the
 * same tick (same `now`). So each new log is stamped at least 1 ms after the
 * run's previous one: the history always comes back in the order it happened.
 */
type LogClock = { runId: string; last: number | null };

async function writeLog(clock: LogClock, stepId: string, entry: LogEntry, now: Date): Promise<void> {
  if (clock.last === null) {
    const prev = await db.automationLog.findFirst({
      where: { runId: clock.runId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    clock.last = prev?.createdAt.getTime() ?? 0;
  }
  const at = Math.max(now.getTime(), clock.last + 1);
  clock.last = at;
  await db.automationLog.create({
    data: {
      runId: clock.runId,
      stepId,
      action: entry.action,
      detail: entry.detail ? (entry.detail as Prisma.InputJsonValue) : Prisma.JsonNull,
      createdAt: new Date(at),
    },
  });
}

// ── One run ──────────────────────────────────────────────────────────────────

function loadAutomation(id: string, cache: Map<string, Promise<LoadedAutomation | null>>): Promise<LoadedAutomation | null> {
  let hit = cache.get(id);
  if (!hit) {
    hit = db.automation
      .findUnique({
        where: { id },
        select: { id: true, workspaceId: true, name: true, status: true, createdById: true, trigger: true, steps: true },
      })
      .then((a) => {
        if (!a) return null;
        const trigger = triggerSchema.safeParse(a.trigger);
        const steps = stepsSchema.safeParse(a.steps);
        return { ...a, trigger: trigger.success ? trigger.data : null, steps: steps.success ? steps.data : null };
      });
    cache.set(id, hit);
  }
  return hit;
}

async function automationIsActive(id: string): Promise<boolean> {
  const a = await db.automation.findUnique({ where: { id }, select: { status: true } });
  return a?.status === "ACTIVE";
}

async function processRun(
  run: ClaimedRun,
  now: Date,
  cache: Map<string, Promise<LoadedAutomation | null>>,
  summary: AutomationTickSummary,
): Promise<void> {
  let stepId = run.currentStepId;
  const logClock: LogClock = { runId: run.id, last: null };

  const exit = async (reason: string, abnormal: boolean, at: string | null, entry?: LogEntry) => {
    if (await finish(run, "EXITED", at, now, abnormal ? reason : null)) {
      summary.exited++;
      await writeLog(logClock, at ?? "end", entry ?? { action: "exited", detail: { reason } }, now);
    }
  };
  const fail = async (error: string, at: string | null) => {
    if (await finish(run, "FAILED", at, now, error.slice(0, 500))) {
      summary.failed++;
      await writeLog(logClock, at ?? "end", { action: "error", detail: { error: error.slice(0, 500) } }, now);
    }
  };

  try {
    const automation = await loadAutomation(run.automationId, cache);
    if (!automation || automation.status !== "ACTIVE") return await release(run);
    if (!automation.trigger || !automation.steps) return await fail("The automation's steps couldn't be read.", stepId);

    // ── Is this person still someone we may email? (checked every time the run wakes up) ──
    const contact = run.contactId
      ? await db.contact.findFirst({
          where: { id: run.contactId, workspaceId: automation.workspaceId },
          select: { id: true, email: true, status: true },
        })
      : null;
    if (!contact) return await exit("The contact was deleted.", true, stepId, { action: "exited", detail: { reason: "contact_deleted" } });
    if (contact.status !== "SUBSCRIBED") {
      return await exit(`The contact is ${contact.status.toLowerCase()}.`, true, stepId, {
        action: "exited",
        detail: { reason: "not_subscribed", status: contact.status },
      });
    }
    if (await isSuppressed(automation.workspaceId, contact.email)) {
      return await exit("The address is on the suppression list.", true, stepId, { action: "exited", detail: { reason: "suppressed" } });
    }

    const ctx: StepContext = {
      now,
      automation: {
        id: automation.id,
        workspaceId: automation.workspaceId,
        name: automation.name,
        trigger: automation.trigger,
        steps: automation.steps,
        createdById: automation.createdById,
      },
      run: { id: run.id, occurrence: run.occurrence },
      contact: { id: contact.id, email: contact.email },
    };

    const visited = new Set<string>();
    let lastStepId: string | null = stepId;
    for (let n = 0; n < MAX_STEPS_PER_TICK; n++) {
      // Paused (or deleted) while we were working: stop here, progress is saved.
      if (n > 0 && !(await automationIsActive(automation.id))) return await release(run);

      if (stepId === null) {
        // The end of the automation.
        if (await finish(run, "COMPLETED", null, now, null)) {
          summary.completed++;
          await writeLog(logClock, lastStepId ?? "end", { action: "completed" }, now);
        }
        return;
      }
      const step = findStep(automation.steps, stepId);
      if (!step) {
        // The automation was edited and this step is gone.
        return await exit("The step this person was on was removed from the automation.", true, stepId, {
          action: "exited",
          detail: { reason: "step_removed" },
        });
      }
      if (visited.has(step.id)) return await fail("The automation went back to a step it already did (loop). Stopped.", step.id);
      visited.add(step.id);

      const waking = n === 0 && run.status === "WAITING";
      const outcome = await executeStep(ctx, step, { waking });
      lastStepId = step.id;

      switch (outcome.kind) {
        case "next":
          await writeLog(logClock, step.id, outcome.log, now);
          // Save after EVERY step: a crash now repeats at most the next step.
          if (!(await saveProgress(run, outcome.next, "ACTIVE", now, false))) return; // claim lost (or run ended elsewhere)
          stepId = outcome.next;
          continue;
        case "wait":
          if (outcome.log) await writeLog(logClock, step.id, outcome.log, now);
          if (await saveProgress(run, step.id, "WAITING", outcome.until, true)) summary.waiting++;
          return;
        case "exit":
          if (await finish(run, "EXITED", step.id, now, null)) {
            summary.exited++;
            await writeLog(logClock, step.id, outcome.log, now);
          }
          return;
        case "fail":
          return await fail(outcome.error, step.id);
      }
    }

    // Loop guard reached: continue in a later tick (1 s later, so not again in this one).
    await writeLog(logClock, stepId ?? "end", { action: "step_limit", detail: { steps: MAX_STEPS_PER_TICK } }, now);
    await saveProgress(run, stepId, "ACTIVE", new Date(now.getTime() + 1_000), true);
  } catch (err) {
    log(`Run ${run.id} failed`, err);
    try {
      await fail(err instanceof Error ? `Unexpected error: ${err.message}` : "Unexpected error.", stepId);
    } catch (inner) {
      log(`Couldn't mark run ${run.id} as failed`, inner); // the claim goes stale and is retried
    }
  }
}
