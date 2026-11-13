import "server-only";
import { Prisma, type AutomationRunStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { flattenSteps, stepsSchema, triggerSchema, type AutomationStep } from "@/lib/automations/schema";

// Numbers for an automation's Statistics tab, and the "Automations" card on a
// contact's page.
//
// SECURITY (multi-tenant isolation): runs, logs and hidden campaigns have no
// workspace id of their own (except campaigns); they belong to an automation,
// and the automation belongs to a workspace. So every function first finds
// the automation (or contact) WITH the workspace id, and only then reads the
// rows hanging off it. ONLY pass the workspace from requireActiveWorkspace().
//
// Days are counted in UTC (the server doesn't know the viewer's time zone).

/** A workspace id, or the ActiveWorkspace object. */
export type WorkspaceArg = string | { id: string };
const wsId = (ws: WorkspaceArg) => (typeof ws === "string" ? ws : ws.id);

export const RUN_STATUSES = ["ACTIVE", "WAITING", "COMPLETED", "EXITED", "FAILED"] as const satisfies readonly AutomationRunStatus[];

const DAYS = 30;
const RECENT_LIMIT = 20;
const TOP_EXIT_REASONS = 8;

// ── Types ───────────────────────────────────────────────────────────────────

export type DailyEntries = { /** "2026-11-13" (a UTC day). */ date: string; entered: number };

export type EmailStepStats = {
  stepId: string;
  name: string;
  subject: string;
  /** false when the step has since been deleted from the automation (its numbers are kept). */
  inWorkflow: boolean;
  sent: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  bounced: number;
  complained: number;
};

export type ExitReason = { status: "EXITED" | "FAILED"; reason: string; count: number };

export type RecentRun = {
  id: string;
  /** null when the contact has been deleted since. */
  contactId: string | null;
  /** e.g. "pr•••@ex•••.com", so the page is safe to screen-share. */
  maskedEmail: string | null;
  status: AutomationRunStatus;
  /** Where they are now ("Wait 2 days", "Welcome email"…), or null when finished. */
  stepName: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type AutomationStatsData = {
  automation: { id: string; name: string; status: "DRAFT" | "ACTIVE" | "PAUSED"; activatedAt: string | null };
  days: number;
  runs: {
    total: number;
    byStatus: Record<AutomationRunStatus, number>;
    /** ACTIVE + WAITING. */
    inProgress: number;
    enteredLast7: number;
    enteredLast30: number;
  };
  daily: DailyEntries[];
  emails: EmailStepStats[];
  exits: ExitReason[];
  recent: RecentRun[];
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Midnight UTC, `days - 1` days ago, so "30 days" = today + the 29 days before. */
function windowStart(days: number, now = new Date()): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** "priya@example.com" → "pr•••@ex•••.com". */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const name = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  const keep = (s: string, n: number) => (s.length <= n ? s.slice(0, 1) : s.slice(0, n));
  return `${keep(local, 2)}•••@${keep(name, 2)}•••${tld}`;
}

/** Stored steps, parsed safely (a bad row gives an empty list, never a crash). */
function readSteps(json: unknown): AutomationStep[] {
  const parsed = stepsSchema.safeParse(json);
  return parsed.success ? parsed.data : [];
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/** A short name for a step, for "where are they now?" columns. */
export function stepName(step: AutomationStep | null): string | null {
  if (!step) return null;
  switch (step.type) {
    case "send_email":
      return step.name;
    case "wait":
      return `Wait ${plural(step.amount, step.unit.replace(/s$/, ""))}`;
    case "condition":
      return step.condition.kind === "email_activity" ? `If/else: ${step.condition.action} an email?` : "If/else";
    case "add_to_list":
      return "Add to a list";
    case "remove_from_list":
      return "Remove from a list";
    case "update_field":
      return "Update a field";
    case "exit":
      return "Exit";
  }
}

/** Where a run is: its current step's name, "Finished" or "Step was removed". */
function currentStepName(steps: AutomationStep[], status: AutomationRunStatus, currentStepId: string | null): string | null {
  if (status === "COMPLETED" || status === "EXITED") return null;
  if (!currentStepId) return null;
  const step = flattenSteps(steps).find((s) => s.id === currentStepId) ?? null;
  return step ? stepName(step) : "A step that was removed";
}

/** The hidden campaign's step id: "<stepId>" or, for yearly birthday emails, "<stepId>:<year>". */
const baseStepId = (automationStepId: string | null) => (automationStepId ?? "").split(":")[0];

/**
 * Exit rows → friendly reasons. A reason code from a log ("exit_step") is
 * translated, and rows that end up with the same words are merged.
 */
function mergeExitReasons(rows: { status: "EXITED" | "FAILED"; reason: string | null; n: number }[]): ExitReason[] {
  const merged = new Map<string, ExitReason>();
  for (const r of rows) {
    const reason = r.reason
      ? (REASON_TEXT[r.reason] ?? r.reason)
      : r.status === "FAILED"
        ? "A step couldn't run"
        : "Left the automation (no reason recorded)";
    const key = `${r.status}:${reason}`;
    const entry = merged.get(key) ?? { status: r.status, reason, count: 0 };
    entry.count += r.n;
    merged.set(key, entry);
  }
  return [...merged.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

// ── The automation's Statistics tab ─────────────────────────────────────────

/**
 * Everything the automation's Statistics tab shows. null when the automation
 * doesn't exist in this workspace (another workspace's id = not found).
 */
export async function getAutomationStats(ws: WorkspaceArg, automationId: string): Promise<AutomationStatsData | null> {
  const workspaceId = wsId(ws);
  const automation = await db.automation.findFirst({
    where: { id: automationId, workspaceId },
    select: { id: true, name: true, status: true, activatedAt: true, steps: true },
  });
  if (!automation) return null;

  // From here on `automation.id` is known to belong to the workspace.
  const since30 = windowStart(DAYS);
  const since7 = windowStart(7);
  const runWhere = { automationId: automation.id };

  const [byStatusRows, last7, dailyRows, campaigns, exitRows, recentRows] = await Promise.all([
    db.automationRun.groupBy({ by: ["status"], where: runWhere, _count: { _all: true } }),
    db.automationRun.count({ where: { ...runWhere, startedAt: { gte: since7 } } }),
    // One row per UTC day. startedAt is stored as UTC, so date_trunc gives the UTC day.
    db.$queryRaw<{ day: Date; n: number }[]>(Prisma.sql`
      SELECT date_trunc('day', "startedAt") AS day, count(*)::int AS n
      FROM "automation_run"
      WHERE "automationId" = ${automation.id} AND "startedAt" >= ${since30}
      GROUP BY 1
    `),
    // Each "Send email" step has a hidden campaign holding its counters
    // (birthday emails get one per year). The workspace check is repeated
    // here because campaigns DO have their own workspace id.
    db.campaign.findMany({
      where: { workspaceId, automationId: automation.id, kind: "AUTOMATION" },
      select: {
        automationStepId: true,
        name: true,
        subject: true,
        sentCount: true,
        openCount: true,
        clickCount: true,
        unsubscribeCount: true,
        bounceCount: true,
        complaintCount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    // Why people left early: the run's own error/reason, else the reason in
    // its last "exited"/"error" log entry.
    db.$queryRaw<{ status: "EXITED" | "FAILED"; reason: string | null; n: number }[]>(Prisma.sql`
      SELECT r."status"::text AS status,
             COALESCE(NULLIF(btrim(r."lastError"), ''), NULLIF(btrim(l.reason), '')) AS reason,
             count(*)::int AS n
      FROM "automation_run" r
      LEFT JOIN LATERAL (
        SELECT COALESCE(g."detail"->>'reason', g."detail"->>'message', g."detail"->>'error') AS reason
        FROM "automation_log" g
        WHERE g."runId" = r."id" AND g."action" IN ('exited', 'error', 'failed')
        ORDER BY g."createdAt" DESC
        LIMIT 1
      ) l ON true
      WHERE r."automationId" = ${automation.id} AND r."status" IN ('EXITED', 'FAILED')
      GROUP BY 1, 2
      ORDER BY n DESC, reason ASC
      LIMIT ${TOP_EXIT_REASONS}
    `),
    db.automationRun.findMany({
      where: runWhere,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: RECENT_LIMIT,
      select: {
        id: true,
        status: true,
        currentStepId: true,
        startedAt: true,
        finishedAt: true,
        contactId: true,
        contact: { select: { email: true, workspaceId: true } },
      },
    }),
  ]);

  const byStatus = Object.fromEntries(RUN_STATUSES.map((s) => [s, 0])) as Record<AutomationRunStatus, number>;
  for (const row of byStatusRows) byStatus[row.status] = row._count._all;
  const total = RUN_STATUSES.reduce((sum, s) => sum + byStatus[s], 0);

  // Daily series with every day present (0 when nobody entered).
  const byDay = new Map<string, DailyEntries>();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(since30);
    d.setUTCDate(d.getUTCDate() + i);
    byDay.set(dayKey(d), { date: dayKey(d), entered: 0 });
  }
  for (const row of dailyRows) {
    const point = byDay.get(dayKey(new Date(row.day)));
    if (point) point.entered += row.n;
  }
  const daily = [...byDay.values()];

  // Per email step: add up its campaign(s), in the order the steps appear.
  const steps = readSteps(automation.steps);
  const emailSteps = flattenSteps(steps).filter((s) => s.type === "send_email");
  const emails = new Map<string, EmailStepStats>();
  for (const s of emailSteps) {
    emails.set(s.id, {
      stepId: s.id, name: s.name, subject: s.subject, inWorkflow: true,
      sent: 0, opened: 0, clicked: 0, unsubscribed: 0, bounced: 0, complained: 0,
    });
  }
  for (const c of campaigns) {
    const id = baseStepId(c.automationStepId);
    if (!id) continue;
    let entry = emails.get(id);
    if (!entry) {
      // The step was deleted later: keep its numbers, clearly labelled.
      entry = {
        stepId: id, name: c.name || "Removed email", subject: c.subject, inWorkflow: false,
        sent: 0, opened: 0, clicked: 0, unsubscribed: 0, bounced: 0, complained: 0,
      };
      emails.set(id, entry);
    }
    entry.sent += c.sentCount;
    entry.opened += c.openCount;
    entry.clicked += c.clickCount;
    entry.unsubscribed += c.unsubscribeCount;
    entry.bounced += c.bounceCount;
    entry.complained += c.complaintCount;
  }

  return {
    automation: {
      id: automation.id,
      name: automation.name,
      status: automation.status,
      activatedAt: automation.activatedAt?.toISOString() ?? null,
    },
    days: DAYS,
    runs: {
      total,
      byStatus,
      inProgress: byStatus.ACTIVE + byStatus.WAITING,
      enteredLast7: last7,
      enteredLast30: daily.reduce((sum, d) => sum + d.entered, 0),
    },
    daily,
    emails: [...emails.values()].filter((e) => e.inWorkflow || e.sent > 0),
    exits: mergeExitReasons(exitRows),
    recent: recentRows.map((r) => {
      // Belt and braces: never show a contact from another workspace.
      const sameWs = r.contact?.workspaceId === workspaceId;
      return {
        id: r.id,
        contactId: sameWs ? r.contactId : null,
        maskedEmail: sameWs ? maskEmail(r.contact?.email) : null,
        status: r.status,
        stepName: currentStepName(steps, r.status, r.currentStepId),
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      };
    }),
  };
}

// ── A contact's automations (the contact page card) ─────────────────────────

const RUNS_ON_CONTACT_PAGE = 20;
const LOGS_PER_RUN = 25;

export type RunLogView = { id: string; label: string; detail: string | null; createdAt: string };

export type ContactRunView = {
  id: string;
  automation: { id: string; name: string; status: "DRAFT" | "ACTIVE" | "PAUSED" };
  status: AutomationRunStatus;
  stepName: string | null;
  /** For yearly automations: which year this run is for. */
  occurrence: string | null;
  lastError: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** Newest first. */
  logs: RunLogView[];
  /** true when more history exists than is shown. */
  moreLogs: boolean;
};

export type EnrollableAutomation = { id: string; name: string };

export type ContactAutomationsData = {
  runs: ContactRunView[];
  /** ACTIVE "added by hand" automations this person isn't currently going through. */
  enrollable: EnrollableAutomation[];
};

/** Plain-English labels for the engine's log actions. Unknown ones are tidied up. */
const LOG_LABELS: Record<string, string> = {
  entered: "Entered the automation",
  email_queued: "Email sent",
  email_already_sent: "Email already sent earlier",
  waiting: "Started waiting",
  waited: "Finished waiting",
  condition_waiting: "If/else: waiting for the email to go out first",
  branch_yes: "If/else: yes",
  branch_no: "If/else: no",
  list_added: "Added to a list",
  list_removed: "Removed from a list",
  list_missing: "Skipped: the list was deleted",
  field_updated: "Field updated",
  field_missing: "Skipped: the field was deleted",
  field_invalid: "Skipped: the value didn't fit the field",
  step_limit: "Paused for a moment (too many steps at once)",
  completed: "Finished the automation",
  exited: "Left the automation",
  error: "Problem",
};

/** The engine's reason codes (in log details), in plain English. */
const REASON_TEXT: Record<string, string> = {
  contact_deleted: "The contact was deleted.",
  not_subscribed: "They're no longer subscribed.",
  suppressed: "The address is on the suppression list.",
  exit_step: "Reached an exit step.",
  step_removed: "Their step was removed from the automation.",
  email_not_sent_yet: "The email it checks hasn't gone out yet.",
};

function logLabel(action: string, step: AutomationStep | null): string {
  const base = LOG_LABELS[action] ?? (action.charAt(0).toUpperCase() + action.slice(1)).replace(/_/g, " ");
  // Name the email / wait involved, e.g. "Email sent: Welcome email".
  if (step && (step.type === "send_email" || step.type === "wait") && action !== "entered" && action !== "exited") {
    return `${base}: ${stepName(step)}`;
  }
  return base;
}

function logDetail(detail: unknown): string | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const d = detail as Record<string, unknown>;
  for (const key of ["reason", "message", "error", "note"]) {
    const v = d[key];
    if (typeof v === "string" && v.trim()) return REASON_TEXT[v.trim()] ?? v.trim().slice(0, 300);
  }
  return null;
}

/**
 * The automations a contact has gone (or is going) through, newest first,
 * each with a short history; plus the automations they can be added to.
 * Returns null when the contact isn't in this workspace.
 */
export async function getContactAutomations(ws: WorkspaceArg, contactId: string): Promise<ContactAutomationsData | null> {
  const workspaceId = wsId(ws);
  const contact = await db.contact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true } });
  if (!contact) return null;

  const [runs, active, current] = await Promise.all([
    db.automationRun.findMany({
      // Both sides checked: the contact AND the automation are in this workspace.
      where: { contactId: contact.id, automation: { workspaceId } },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: RUNS_ON_CONTACT_PAGE,
      select: {
        id: true,
        status: true,
        currentStepId: true,
        occurrence: true,
        lastError: true,
        startedAt: true,
        finishedAt: true,
        automation: { select: { id: true, name: true, status: true, steps: true } },
        logs: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: LOGS_PER_RUN + 1,
          select: { id: true, stepId: true, action: true, detail: true, createdAt: true },
        },
      },
    }),
    db.automation.findMany({
      where: { workspaceId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, trigger: true },
    }),
    // Automations they're in right now (they can't be added twice).
    db.automationRun.findMany({
      where: { contactId: contact.id, status: { in: ["ACTIVE", "WAITING"] }, automation: { workspaceId } },
      select: { automationId: true },
    }),
  ]);

  // Steps are parsed once per automation, not once per run.
  const stepsCache = new Map<string, AutomationStep[]>();
  const stepsOf = (a: { id: string; steps: unknown }) => {
    let list = stepsCache.get(a.id);
    if (!list) {
      list = flattenSteps(readSteps(a.steps));
      stepsCache.set(a.id, list);
    }
    return list;
  };

  const runViews: ContactRunView[] = runs.map((r) => {
    const steps = stepsOf(r.automation);
    const find = (id: string | null) => (id ? (steps.find((s) => s.id === id) ?? null) : null);
    return {
      id: r.id,
      automation: { id: r.automation.id, name: r.automation.name, status: r.automation.status },
      status: r.status,
      stepName: currentStepName(steps, r.status, r.currentStepId),
      occurrence: r.occurrence,
      lastError: r.lastError,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      logs: r.logs.slice(0, LOGS_PER_RUN).map((l) => ({
        id: l.id,
        label: logLabel(l.action, find(l.stepId)),
        detail: logDetail(l.detail),
        createdAt: l.createdAt.toISOString(),
      })),
      moreLogs: r.logs.length > LOGS_PER_RUN,
    };
  });

  // Only "added by hand" automations can take people from the contact page;
  // the others start on their own (list joined, form, birthday…).
  const inProgress = new Set(current.map((r) => r.automationId));
  const enrollable = active
    .filter((a) => triggerSchema.safeParse(a.trigger).data?.type === "manual" && !inProgress.has(a.id))
    .map((a) => ({ id: a.id, name: a.name }));

  return { runs: runViews, enrollable };
}
