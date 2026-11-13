import "server-only";
import { Prisma, type FormSubmissionResult } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Statistics for sign-up forms: how many people signed up, when, from which
// page, and what happened to each submission.
//
// SECURITY (multi-tenant isolation): FormSubmission rows have no workspace id
// of their own; they belong to a form, and the form belongs to a workspace.
// So every query here first checks (or joins on) signup_form.workspaceId.
// ONLY pass the workspace from requireActiveWorkspace().
//
// Days are counted in UTC (the server doesn't know the viewer's time zone),
// and the UI says so.

/** A workspace id, or the ActiveWorkspace object. */
export type WorkspaceArg = string | { id: string };
const wsId = (ws: WorkspaceArg) => (typeof ws === "string" ? ws : ws.id);

export const FORM_RESULTS = [
  "SUBSCRIBED",
  "PENDING",
  "ALREADY_SUBSCRIBED",
  "NOT_RESUBSCRIBED",
  "SUPPRESSED",
  "SPAM",
] as const satisfies readonly FormSubmissionResult[];

/** Results that count as a new sign-up (subscribed straight away, or waiting for the confirmation click). */
const SIGNUP_RESULTS: FormSubmissionResult[] = ["SUBSCRIBED", "PENDING"];
/** People we deliberately did NOT re-subscribe (they had left, bounced or are on the suppression list). */
const BLOCKED_RESULTS: FormSubmissionResult[] = ["NOT_RESUBSCRIBED", "SUPPRESSED"];

/** Most days a chart can cover (a year), so a bad input can't build a huge series. */
const MAX_DAYS = 366;
/** How many recent submissions the stats page lists. */
const RECENT_LIMIT = 20;
/** How many top sources we return. */
const TOP_SOURCES = 10;

export type DailyPoint = {
  /** "2026-11-13" (a UTC day). */
  date: string;
  signups: number;
  /** Already subscribed + blocked (not spam). */
  other: number;
  spam: number;
};

export type SourceRow = {
  /** "example.com/blog/post", or a friendly name like "Hosted form page". */
  label: string;
  /** The hostname, or null for "unknown" (no Referer). */
  host: string | null;
  signups: number;
  submissions: number;
};

export type RecentSubmission = {
  id: string;
  /** e.g. "pr•••@ex•••.com": masked so the page is safe to screen-share. */
  maskedEmail: string | null;
  result: FormSubmissionResult;
  source: string | null;
  contactId: string | null;
  createdAt: string;
};

export type FormStats = {
  days: number;
  /** First day of the window (UTC midnight, ISO). */
  since: string;
  /** Submissions per result in the window (every result present, 0 if none). */
  totals: Record<FormSubmissionResult, number>;
  /** All submissions in the window, spam included. */
  submissions: number;
  /** SUBSCRIBED + PENDING. */
  signups: number;
  alreadySubscribed: number;
  /** NOT_RESUBSCRIBED + SUPPRESSED. */
  blocked: number;
  spamBlocked: number;
  /**
   * What the people who signed up in the window are NOW (their contact's
   * current status): confirmed = SUBSCRIBED, awaiting = PENDING (double
   * opt-in email not clicked yet), left = unsubscribed/bounced/complained or
   * deleted since.
   */
  people: { confirmed: number; awaiting: number; left: number };
  /** Sign-ups since the form was created (all time). */
  allTimeSignups: number;
  daily: DailyPoint[];
  topSources: SourceRow[];
  recent: RecentSubmission[];
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function clampDays(days: number | undefined): number {
  const n = Math.floor(Number(days ?? 30));
  return Number.isFinite(n) ? Math.min(MAX_DAYS, Math.max(1, n)) : 30;
}

/** Midnight UTC, `days - 1` days ago, so "30 days" = today + the 29 days before. */
export function windowStart(days: number, now = new Date()): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * "priya@example.com" → "pr•••@ex•••.com". Enough to recognise a test
 * sign-up of your own, without showing real addresses on screen.
 */
export function maskEmail(email: string | null): string | null {
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

const UNKNOWN_SOURCE = "Direct link, QR code or unknown page";

/** The app's own host, so sign-ups on our hosted page get a friendly name. */
function appHost(): string | null {
  try {
    return new URL(process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").host;
  } catch {
    return null;
  }
}

/**
 * "https://www.example.com/blog/post/?utm_source=x#top" → "example.com/blog/post".
 * The query string and #hash are dropped so campaign tags don't split one
 * page into many rows.
 */
export function sourceLabel(sourceUrl: string | null, ownHost = appHost()): { label: string; host: string | null } {
  // No address: someone opened the share link / QR code directly, or the
  // website didn't tell the browser to send its address (privacy settings).
  if (!sourceUrl) return { label: UNKNOWN_SOURCE, host: null };
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return { label: UNKNOWN_SOURCE, host: null };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { label: UNKNOWN_SOURCE, host: null };
  if (ownHost && url.host === ownHost && url.pathname.startsWith("/f/")) return { label: "Hosted form page (share link / QR)", host: url.host };
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  return { label: `${host}${path}`, host: url.hostname };
}

const emptyTotals = (): Record<FormSubmissionResult, number> =>
  Object.fromEntries(FORM_RESULTS.map((r) => [r, 0])) as Record<FormSubmissionResult, number>;

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Everything the form's Statistics tab shows. Returns null when the form
 * doesn't exist in this workspace (another workspace's form = not found).
 */
export async function getFormStats(ws: WorkspaceArg, formId: string, opts: { days?: number } = {}): Promise<FormStats | null> {
  const workspaceId = wsId(ws);
  const days = clampDays(opts.days);
  const since = windowStart(days);

  const form = await db.signupForm.findFirst({ where: { id: formId, workspaceId }, select: { id: true } });
  if (!form) return null;

  // From here on `form.id` is known to belong to the workspace.
  const inWindow = { formId: form.id, createdAt: { gte: since } };

  const [byResult, allTimeSignups, dailyRows, sourceRows, peopleRows, recentRows] = await Promise.all([
    db.formSubmission.groupBy({ by: ["result"], where: inWindow, _count: { _all: true } }),
    db.formSubmission.count({ where: { formId: form.id, result: { in: SIGNUP_RESULTS } } }),
    // One row per (UTC day, result). createdAt is stored as UTC, so
    // date_trunc gives the UTC day.
    db.$queryRaw<{ day: Date; result: FormSubmissionResult; n: number }[]>(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS day, "result", count(*)::int AS n
      FROM "form_submission"
      WHERE "formId" = ${form.id} AND "createdAt" >= ${since}
      GROUP BY 1, 2
    `),
    // Counted per exact address first; tidied into "host/path" below.
    // Spam is left out: bots fake their Referer, so it would only add noise.
    db.formSubmission.groupBy({
      by: ["sourceUrl", "result"],
      where: { ...inWindow, result: { not: "SPAM" } },
      _count: { _all: true },
      orderBy: { _count: { sourceUrl: "desc" } },
      take: 5000,
    }),
    // The CURRENT status of each person who signed up in the window (counted
    // once even if they submitted twice). The contact must also be in this
    // workspace (belt and braces); a deleted contact comes back as NULL.
    db.$queryRaw<{ status: string | null; n: number }[]>(Prisma.sql`
      SELECT c."status"::text AS status, count(DISTINCT s."contactId")::int AS n
      FROM "form_submission" s
      LEFT JOIN "contact" c ON c."id" = s."contactId" AND c."workspaceId" = ${workspaceId}
      WHERE s."formId" = ${form.id} AND s."createdAt" >= ${since}
        AND s."result" IN ('SUBSCRIBED', 'PENDING') AND s."contactId" IS NOT NULL
      GROUP BY 1
    `),
    db.formSubmission.findMany({
      where: { formId: form.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RECENT_LIMIT,
      select: { id: true, email: true, result: true, sourceUrl: true, contactId: true, createdAt: true },
    }),
  ]);

  const totals = emptyTotals();
  for (const row of byResult) totals[row.result] = row._count._all;
  const submissions = FORM_RESULTS.reduce((sum, r) => sum + totals[r], 0);
  const signups = totals.SUBSCRIBED + totals.PENDING;

  const confirmed = peopleRows.find((r) => r.status === "SUBSCRIBED")?.n ?? 0;
  const awaiting = peopleRows.find((r) => r.status === "PENDING")?.n ?? 0;
  // Everyone else has unsubscribed, bounced, complained or been deleted since.
  const left = peopleRows.filter((r) => r.status !== "SUBSCRIBED" && r.status !== "PENDING").reduce((sum, r) => sum + r.n, 0);

  // Daily series with every day present (0 when nothing happened).
  const byDay = new Map<string, DailyPoint>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    byDay.set(dayKey(d), { date: dayKey(d), signups: 0, other: 0, spam: 0 });
  }
  for (const row of dailyRows) {
    const point = byDay.get(dayKey(new Date(row.day)));
    if (!point) continue;
    if (SIGNUP_RESULTS.includes(row.result)) point.signups += row.n;
    else if (row.result === "SPAM") point.spam += row.n;
    else point.other += row.n;
  }

  // Merge exact URLs into "host/path" rows.
  const ownHost = appHost();
  const sources = new Map<string, SourceRow>();
  for (const row of sourceRows) {
    const { label, host } = sourceLabel(row.sourceUrl, ownHost);
    const entry = sources.get(label) ?? { label, host, signups: 0, submissions: 0 };
    entry.submissions += row._count._all;
    if (SIGNUP_RESULTS.includes(row.result)) entry.signups += row._count._all;
    sources.set(label, entry);
  }
  const topSources = [...sources.values()]
    .sort((a, b) => b.signups - a.signups || b.submissions - a.submissions || a.label.localeCompare(b.label))
    .slice(0, TOP_SOURCES);

  return {
    days,
    since: since.toISOString(),
    totals,
    submissions,
    signups,
    alreadySubscribed: totals.ALREADY_SUBSCRIBED,
    blocked: BLOCKED_RESULTS.reduce((sum, r) => sum + totals[r], 0),
    spamBlocked: totals.SPAM,
    people: { confirmed, awaiting, left },
    allTimeSignups,
    daily: [...byDay.values()],
    topSources,
    recent: recentRows.map((r) => ({
      id: r.id,
      maskedEmail: maskEmail(r.email),
      result: r.result,
      source: r.sourceUrl ? sourceLabel(r.sourceUrl, ownHost).label : null,
      contactId: r.contactId,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export type WorkspaceFormsSummary = {
  days: number;
  since: string;
  /** SUBSCRIBED + PENDING across all the workspace's forms. */
  signups: number;
  spamBlocked: number;
  submissions: number;
  /** Forms currently accepting sign-ups. */
  activeForms: number;
  /** Best forms first (by sign-ups in the window), at most 5. */
  topForms: { id: string; name: string; signups: number }[];
};

/** Sign-ups across every form in the workspace (for the dashboard). */
export async function getWorkspaceFormsSummary(ws: WorkspaceArg, opts: { days?: number } = {}): Promise<WorkspaceFormsSummary> {
  const workspaceId = wsId(ws);
  const days = clampDays(opts.days);
  const since = windowStart(days);

  const [perForm, activeForms] = await Promise.all([
    db.$queryRaw<{ id: string; name: string; signups: number; spam: number; total: number }[]>(Prisma.sql`
      SELECT f."id", f."name",
             count(*) FILTER (WHERE s."result" IN ('SUBSCRIBED', 'PENDING'))::int AS signups,
             count(*) FILTER (WHERE s."result" = 'SPAM')::int AS spam,
             count(*)::int AS total
      FROM "signup_form" f
      JOIN "form_submission" s ON s."formId" = f."id" AND s."createdAt" >= ${since}
      WHERE f."workspaceId" = ${workspaceId}
      GROUP BY f."id", f."name"
    `),
    db.signupForm.count({ where: { workspaceId, status: "ACTIVE" } }),
  ]);

  return {
    days,
    since: since.toISOString(),
    signups: perForm.reduce((sum, f) => sum + f.signups, 0),
    spamBlocked: perForm.reduce((sum, f) => sum + f.spam, 0),
    submissions: perForm.reduce((sum, f) => sum + f.total, 0),
    activeForms,
    topForms: perForm
      .filter((f) => f.signups > 0)
      .sort((a, b) => b.signups - a.signups || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map((f) => ({ id: f.id, name: f.name, signups: f.signups })),
  };
}
