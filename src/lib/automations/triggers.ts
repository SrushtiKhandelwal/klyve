import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { stepsSchema, triggerSchema, type AutomationTrigger } from "@/lib/automations/schema";
import { notSuppressedSql } from "@/lib/suppression";

// TRIGGERS: who enters an automation, and when.
//
// Every tick the worker calls runTriggerScan(). For each ACTIVE automation
// (at most every 30 s each) we look for events that happened after its
// `triggerCursor`, enrol the matching people, and move the cursor forward.
//
//   list_joined      a ListMembership was added to the list
//   form_submitted   a FormSubmission (SUBSCRIBED/PENDING) for the form
//   contact_created  a new contact
//   date_anniversary once per UTC day: people whose DATE field is today (+N days)
//   manual           nothing to scan (people are added by hand: enrollContacts)
//
// DOUBLE OPT-IN: a PENDING person isn't subscribed yet, so they can't enter.
// They enter when they CONFIRM (contact.confirmedAt). So each event's time is
// "when it became true AND they were confirmed":
//     event time = the later of (joined / signed up) and (confirmed, if ever)
//
// THE RULES THAT KEEP IT CORRECT
//  • Nobody enters twice for the same occurrence. AutomationRun is unique per
//    (automation, contact, occurrence) and we insert with ON CONFLICT DO
//    NOTHING. Postgres treats NULLs as all different, so `occurrence` is
//    ALWAYS set: "once" (no re-entry), the year (birthdays), or the event's
//    own id/time (re-entry allowed).
//  • Nothing is skipped. We re-scan a 2-minute OVERLAP behind the cursor
//    (rows saved by a slow transaction may show up a little late), and the
//    query itself filters out people who already have their run. So
//    re-scanning is harmless, and the cursor only jumps to "now" once
//    EVERYTHING eligible up to now was enrolled. With more than 1000 new
//    people, the cursor moves to the last one enrolled and the next scan
//    continues from there: many events sharing one timestamp (e.g. a CSV
//    import) can never make us skip or repeat anyone.
//  • Never a suppressed or unsubscribed address: the INSERT itself re-checks
//    SUBSCRIBED + the suppression list.
//  • Never another workspace: every source query and the INSERT filter by the
//    automation's workspace.
//  • No runaway loops. Steps can add people to lists, which can trigger
//    automations again. With re-entry OFF everyone enters once, ever. With
//    re-entry ON a person can be in an automation only once at a time, and
//    can re-enter at most once every 24 hours.
//  • Enrolment only happens while the automation is ACTIVE (checked inside
//    the INSERT, so a pause wins even mid-scan).

/** How often one automation's trigger is scanned. */
const SCAN_EVERY_MS = 30_000;
/** Most people enrolled per automation per scan. */
export const ENROLL_BATCH = 1000;
/** Most automations scanned per tick (the rest go next tick, oldest-scanned first). */
const MAX_AUTOMATIONS_PER_TICK = 25;
/** We re-check this far behind the cursor, for rows that were committed late. */
const OVERLAP_MS = 2 * 60_000;
/** With re-entry ON: a person may re-enter at most once per this period. */
export const REENTRY_COOLDOWN_MS = 24 * 60 * 60_000;
/** Most people per manual enrolment call. */
export const MANUAL_ENROLL_MAX = 5000;

const DAY_MS = 86_400_000;

const ts = (d: Date) => Prisma.sql`${d}::timestamp`;

function log(message: string, err?: unknown) {
  if (err === undefined) console.log(`[automations] ${message}`);
  else console.error(`[automations] ${message}:`, err instanceof Error ? err.message : err);
}

// ── State: when each automation was last scanned (memory only; a restart just scans sooner) ──

const holder = globalThis as unknown as { klyveTriggerScans?: Map<string, number> };
function lastScans(): Map<string, number> {
  holder.klyveTriggerScans ??= new Map();
  return holder.klyveTriggerScans;
}

// ── Enrolling (shared by every trigger and by manual enrolment) ──────────────

/** How occurrences are chosen, which decides who may enter again. */
export type OccurrenceMode =
  /** Re-entry OFF: occurrence "once"; anyone who ever had a run is skipped. */
  | { kind: "once" }
  /** Re-entry ON: occurrence = the event's own key; one live run at a time (+ cooldown). */
  | { kind: "reentry"; cooldownMs: number }
  /** Birthdays: occurrence = the year; once per person per year. */
  | { kind: "year"; year: string };

export type EnrollTarget = { id: string; workspaceId: string; firstStepId: string };

export type EnrollResult = {
  /** Eligible people picked in this batch. */
  picked: number;
  /** The event time of the last one picked (for the cursor). */
  lastAt: Date | null;
  /** Runs actually created (picked minus any lost to a race). */
  enrolled: number;
};

/**
 * Enrols people from `source`, a query returning rows of
 *   (contact_id text, at timestamp, occ text)
 * = who, when the event happened, and the event's own key (used as the
 * occurrence when re-entry is allowed). ONE statement:
 *   1. keeps contacts of THIS workspace that are SUBSCRIBED and not suppressed
 *   2. drops people who already have a run (see OccurrenceMode)
 *   3. takes the oldest `limit` events, one per person
 *   4. inserts the runs (ON CONFLICT DO NOTHING), an "entered" log each, and
 *      bumps enrolledCount, only while the automation is ACTIVE.
 */
export async function enrollFromSource(
  target: EnrollTarget,
  source: Prisma.Sql,
  mode: OccurrenceMode,
  options: { now: Date; limit: number; detail: Record<string, unknown> },
): Promise<EnrollResult> {
  const { now, limit } = options;
  const occurrence =
    mode.kind === "once" ? Prisma.sql`'once'::text` : mode.kind === "year" ? Prisma.sql`${mode.year}::text` : Prisma.sql`ev.occ`;

  // Who already has a run that blocks entering again.
  let blocking: Prisma.Sql;
  if (mode.kind === "once") {
    blocking = Prisma.sql`TRUE`; // any earlier run at all
  } else if (mode.kind === "year") {
    blocking = Prisma.sql`r.occurrence = ${mode.year}`;
  } else {
    const since = new Date(now.getTime() - mode.cooldownMs);
    blocking = Prisma.sql`(r.occurrence = ev.occ OR r.status IN ('ACTIVE', 'WAITING') OR r."startedAt" > ${ts(since)})`;
  }

  const rows = await db.$queryRaw<{ picked: number; last_at: Date | null; enrolled: number }[]>(Prisma.sql`
    WITH ev AS (${source}),
    eligible AS (
      SELECT DISTINCT ON (ev.contact_id) ev.contact_id, ev.at, ${occurrence} AS occurrence
      FROM ev
      JOIN contact c ON c.id = ev.contact_id
      WHERE c."workspaceId" = ${target.workspaceId}
        AND c.status = 'SUBSCRIBED'::"ContactStatus"
        AND ${notSuppressedSql("c")}
        AND NOT EXISTS (
          SELECT 1 FROM automation_run r
          WHERE r."automationId" = ${target.id} AND r."contactId" = ev.contact_id AND ${blocking})
      ORDER BY ev.contact_id, ev.at
    ),
    batch AS (
      SELECT * FROM eligible ORDER BY at, contact_id LIMIT ${limit}::int
    ),
    ins AS (
      INSERT INTO automation_run (id, "automationId", "contactId", status, "currentStepId", "nextRunAt", occurrence, "startedAt")
      SELECT 'ar' || replace(gen_random_uuid()::text, '-', ''), ${target.id}, b.contact_id, 'ACTIVE'::"AutomationRunStatus",
             ${target.firstStepId}, ${ts(now)}, b.occurrence, ${ts(now)}
      FROM batch b
      WHERE EXISTS (
        SELECT 1 FROM automation a
        WHERE a.id = ${target.id} AND a."workspaceId" = ${target.workspaceId} AND a.status = 'ACTIVE'::"AutomationStatus")
      ON CONFLICT ("automationId", "contactId", occurrence) DO NOTHING
      RETURNING id
    ),
    logs AS (
      INSERT INTO automation_log (id, "runId", "stepId", action, detail, "createdAt")
      SELECT 'al' || replace(gen_random_uuid()::text, '-', ''), ins.id, ${target.firstStepId}, 'entered',
             ${JSON.stringify(options.detail)}::jsonb, ${ts(now)}
      FROM ins
    ),
    bump AS (
      UPDATE automation SET "enrolledCount" = "enrolledCount" + (SELECT count(*) FROM ins)::int
      WHERE id = ${target.id} AND (SELECT count(*) FROM ins) > 0
    )
    SELECT (SELECT count(*) FROM batch)::int AS picked,
           (SELECT max(at) FROM batch) AS last_at,
           (SELECT count(*) FROM ins)::int AS enrolled`);
  const r = rows[0];
  return { picked: r?.picked ?? 0, lastAt: r?.last_at ?? null, enrolled: r?.enrolled ?? 0 };
}

/** The occurrence rule for an automation (trigger + its re-entry switch). */
export function occurrenceMode(trigger: AutomationTrigger, allowReentry: boolean, now: Date): OccurrenceMode {
  if (trigger.type === "date_anniversary") return { kind: "year", year: String(anniversaryTarget(now, trigger.daysBefore).getUTCFullYear()) };
  return allowReentry ? { kind: "reentry", cooldownMs: REENTRY_COOLDOWN_MS } : { kind: "once" };
}

// ── Event sources (one per trigger) ──────────────────────────────────────────
// Each returns (contact_id, at, occ) for events with lo < at <= hi.
// `at` = when the person really "entered" (see DOUBLE OPT-IN above).

/** Epoch milliseconds of a timestamp expression, as text (for occurrence keys). */
const msText = (expr: Prisma.Sql) => Prisma.sql`((extract(epoch FROM ${expr}) * 1000)::bigint)::text`;

function listJoinedSource(workspaceId: string, listId: string, lo: Date, hi: Date): Prisma.Sql {
  const at = Prisma.sql`GREATEST(m."addedAt", COALESCE(c."confirmedAt", m."addedAt"))`;
  return Prisma.sql`
    SELECT m."contactId" AS contact_id, ${at} AS at, 'list:' || ${msText(at)} AS occ
    FROM list_membership m
    JOIN contact_list l ON l.id = m."listId" AND l."workspaceId" = ${workspaceId}
    JOIN contact c ON c.id = m."contactId" AND c."workspaceId" = ${workspaceId}
    WHERE m."listId" = ${listId}
      AND (m."addedAt" > ${ts(lo)} OR c."confirmedAt" > ${ts(lo)})
      AND ${at} > ${ts(lo)} AND ${at} <= ${ts(hi)}`;
}

function formSubmittedSource(workspaceId: string, formId: string, lo: Date, hi: Date): Prisma.Sql {
  // SUBSCRIBED sign-ups count when submitted; PENDING ones when the person
  // confirms (after that submission). Several PENDING sign-ups before one
  // confirmation share the confirmation as their key, so they enter once.
  const at = Prisma.sql`CASE WHEN s.result = 'SUBSCRIBED' THEN s."createdAt" ELSE c."confirmedAt" END`;
  const occ = Prisma.sql`CASE WHEN s.result = 'SUBSCRIBED' THEN 'form:' || s.id ELSE 'confirm:' || ${msText(Prisma.sql`c."confirmedAt"`)} END`;
  return Prisma.sql`
    SELECT s."contactId" AS contact_id, ${at} AS at, ${occ} AS occ
    FROM form_submission s
    JOIN signup_form f ON f.id = s."formId" AND f."workspaceId" = ${workspaceId}
    JOIN contact c ON c.id = s."contactId" AND c."workspaceId" = ${workspaceId}
    WHERE s."formId" = ${formId}
      AND (
        (s.result = 'SUBSCRIBED' AND s."createdAt" > ${ts(lo)} AND s."createdAt" <= ${ts(hi)})
        OR (s.result = 'PENDING' AND c."confirmedAt" > ${ts(lo)} AND c."confirmedAt" <= ${ts(hi)}
            AND c."confirmedAt" >= s."createdAt")
      )`;
}

function contactCreatedSource(workspaceId: string, lo: Date, hi: Date): Prisma.Sql {
  const at = Prisma.sql`GREATEST(c."createdAt", COALESCE(c."confirmedAt", c."createdAt"))`;
  return Prisma.sql`
    SELECT c.id AS contact_id, ${at} AS at, 'contact:' || ${msText(at)} AS occ
    FROM contact c
    WHERE c."workspaceId" = ${workspaceId}
      AND (c."createdAt" > ${ts(lo)} OR c."confirmedAt" > ${ts(lo)})
      AND ${at} > ${ts(lo)} AND ${at} <= ${ts(hi)}`;
}

// ── Birthdays / anniversaries ────────────────────────────────────────────────

const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Midnight UTC at the start of `d`'s day. */
export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** The date being celebrated: today (UTC) + daysBefore. */
export function anniversaryTarget(now: Date, daysBefore: number): Date {
  return new Date(utcDayStart(now).getTime() + daysBefore * DAY_MS);
}

/**
 * Which stored "MM-DD" values match the target date. People born on Feb 29
 * celebrate on Feb 28 in years without a Feb 29 (so they still get their
 * email every year, never on Mar 1).
 */
export function anniversaryMonthDays(target: Date): string[] {
  const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(target.getUTCDate()).padStart(2, "0");
  const days = [`${mm}-${dd}`];
  if (mm === "02" && dd === "28" && !isLeapYear(target.getUTCFullYear())) days.push("02-29");
  return days;
}

function anniversarySource(workspaceId: string, key: string, monthDays: string[], now: Date, year: string): Prisma.Sql {
  // DATE fields are stored as "YYYY-MM-DD" text; anything else is ignored.
  return Prisma.sql`
    SELECT c.id AS contact_id, ${ts(now)} AS at, ${year}::text AS occ
    FROM contact c
    WHERE c."workspaceId" = ${workspaceId}
      AND c.status = 'SUBSCRIBED'::"ContactStatus"
      AND (c.attributes ->> ${key}::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND substr(c.attributes ->> ${key}::text, 6, 5) = ANY(${monthDays}::text[])`;
}

// ── The scan ─────────────────────────────────────────────────────────────────

type ScanRow = {
  id: string;
  workspaceId: string;
  trigger: unknown;
  steps: unknown;
  allowReentry: boolean;
  triggerCursor: Date | null;
  activatedAt: Date | null;
};

export type TriggerScanOptions = {
  /** Tests: only these workspaces (never touch anyone else's automations). */
  workspaceIds?: string[];
  /** Tests: ignore the "every 30 s" throttle. */
  force?: boolean;
};

/**
 * Called by the worker each tick. Scans due ACTIVE automations and enrols
 * new people. Returns how many runs were created. Never throws for one
 * automation's problem (it's logged, the others continue).
 */
export async function runTriggerScan(now: Date = new Date(), options: TriggerScanOptions = {}): Promise<number> {
  const scans = lastScans();
  const rows = await db.automation.findMany({
    where: {
      status: "ACTIVE",
      ...(options.workspaceIds ? { workspaceId: { in: options.workspaceIds } } : {}),
    },
    select: { id: true, workspaceId: true, trigger: true, steps: true, allowReentry: true, triggerCursor: true, activatedAt: true },
    orderBy: { id: "asc" },
    take: 2000,
  });

  const due = rows
    .filter((a) => {
      if (options.force) return true;
      const last = scans.get(a.id);
      const age = last === undefined ? Infinity : now.getTime() - last;
      return age < 0 || age >= SCAN_EVERY_MS; // a test clock going backwards also counts as due
    })
    .sort((a, b) => (scans.get(a.id) ?? 0) - (scans.get(b.id) ?? 0))
    .slice(0, MAX_AUTOMATIONS_PER_TICK);

  let enrolled = 0;
  for (const a of due) {
    scans.set(a.id, now.getTime());
    try {
      enrolled += await scanAutomation(a, now);
    } catch (err) {
      log(`Trigger scan failed for automation ${a.id}`, err);
    }
  }
  // Forget automations that are gone, so the map can't grow forever.
  if (scans.size > 5000) for (const id of [...scans.keys()].slice(0, scans.size - 5000)) scans.delete(id);
  return enrolled;
}

async function scanAutomation(a: ScanRow, now: Date): Promise<number> {
  const trigger = triggerSchema.safeParse(a.trigger);
  const steps = stepsSchema.safeParse(a.steps);
  if (!trigger.success || !steps.success || steps.data.length === 0) return 0; // activation validates; never guess
  if (trigger.data.type === "manual") return 0;
  const target: EnrollTarget = { id: a.id, workspaceId: a.workspaceId, firstStepId: steps.data[0].id };
  const detail = { source: "trigger", trigger: trigger.data.type };

  // ── Once a day: birthdays ──
  if (trigger.data.type === "date_anniversary") {
    // triggerCursor = when today's scan FINISHED (null = never). Done today → wait for tomorrow.
    if (a.triggerCursor && a.triggerCursor.getTime() >= utcDayStart(now).getTime() && a.triggerCursor.getTime() <= now.getTime()) {
      return 0;
    }
    const attribute = await db.contactAttribute.findFirst({
      where: { workspaceId: a.workspaceId, key: trigger.data.attributeKey },
      select: { type: true },
    });
    if (attribute?.type !== "DATE") return 0; // the field was deleted or changed: nobody matches
    const targetDay = anniversaryTarget(now, trigger.data.daysBefore);
    const year = String(targetDay.getUTCFullYear());
    const source = anniversarySource(a.workspaceId, trigger.data.attributeKey, anniversaryMonthDays(targetDay), now, year);
    const r = await enrollFromSource(target, source, { kind: "year", year }, { now, limit: ENROLL_BATCH, detail });
    // Fewer than a full batch = everyone for today is in: mark the day done.
    if (r.picked < ENROLL_BATCH) await moveCursor(a.id, a.triggerCursor, now);
    return r.enrolled;
  }

  // ── Event triggers ──
  if (!a.triggerCursor) {
    // Activation always sets it; if it's missing, start watching from now
    // (never enrol everyone who joined in the past).
    await moveCursor(a.id, null, now);
    return 0;
  }
  // Where to start looking: a little before the cursor (the overlap), but
  // never before the activation, so turning an automation on doesn't enrol
  // people from the past. Exception: after a RE-activation the cursor is
  // older than the activation (catching up on the pause, see lifecycle.ts),
  // and then we look from the cursor.
  const cursor = a.triggerCursor.getTime();
  const activated = a.activatedAt?.getTime() ?? cursor;
  const lo = new Date(cursor >= activated ? Math.max(cursor - OVERLAP_MS, activated) : cursor - OVERLAP_MS);
  const hi = now;
  if (hi.getTime() <= lo.getTime()) return 0;

  let source: Prisma.Sql;
  switch (trigger.data.type) {
    case "list_joined":
      source = listJoinedSource(a.workspaceId, trigger.data.listId, lo, hi);
      break;
    case "form_submitted":
      source = formSubmittedSource(a.workspaceId, trigger.data.formId, lo, hi);
      break;
    case "contact_created":
      source = contactCreatedSource(a.workspaceId, lo, hi);
      break;
  }
  const mode = occurrenceMode(trigger.data, a.allowReentry, now);
  const r = await enrollFromSource(target, source, mode, { now, limit: ENROLL_BATCH, detail });

  // All caught up → the cursor goes to "now". A full batch → only up to the
  // last person enrolled (the rest are picked up next scan).
  const next = r.picked < ENROLL_BATCH ? hi : (r.lastAt ?? a.triggerCursor);
  if (next.getTime() > a.triggerCursor.getTime()) await moveCursor(a.id, a.triggerCursor, next);
  return r.enrolled;
}

/**
 * Saves the cursor only if nobody changed it meanwhile (e.g. the user paused,
 * edited the trigger and re-activated). Raw SQL so `updatedAt` (which the
 * builder uses to detect edits) doesn't change.
 */
async function moveCursor(automationId: string, expected: Date | null, next: Date): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE automation SET "triggerCursor" = ${ts(next)}
    WHERE id = ${automationId} AND "triggerCursor" IS NOT DISTINCT FROM ${expected}::timestamp`);
}

/** Tests: forget the throttle so the next scan runs immediately. */
export function resetTriggerScanThrottle(): void {
  lastScans().clear();
}
