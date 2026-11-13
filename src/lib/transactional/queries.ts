import "server-only";
import { Prisma, type TransactionalStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { dayAfter, startOfDay } from "@/lib/format-date";
import { TRANSACTIONAL_STATUSES, type PublicEmail, type TransactionalStatusName } from "./schema";
import { userIdempotencyKey } from "./idempotency";

// Reading transactional emails back: for the public API (A) and the
// dashboard's logs pages (C).
//
// Every function takes a workspaceId and filters by it. ONLY pass the id of
// the API key's workspace or of requireActiveWorkspace(), never one from the
// request: that filter is what keeps workspaces apart.

// ── The public shape ─────────────────────────────────────────────────────────

/** The columns toPublicEmail needs. Use in `select` so big HTML isn't loaded for nothing. */
export const PUBLIC_EMAIL_SELECT = {
  id: true,
  status: true,
  toEmail: true,
  toName: true,
  fromEmail: true,
  fromName: true,
  replyTo: true,
  subject: true,
  templateId: true,
  tags: true,
  metadata: true,
  lastError: true,
  createdAt: true,
  sentAt: true,
} as const satisfies Prisma.TransactionalEmailSelect;

export type PublicEmailRow = Prisma.TransactionalEmailGetPayload<{ select: typeof PUBLIC_EMAIL_SELECT }>;

/** A database row → the JSON object the API returns (lower-case status, ISO dates). */
export function toPublicEmail(row: PublicEmailRow): PublicEmail {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : null;
  return {
    id: row.id,
    object: "email",
    status: row.status.toLowerCase() as PublicEmail["status"],
    to: row.toName ? { email: row.toEmail, name: row.toName } : { email: row.toEmail },
    from: row.fromName ? { email: row.fromEmail, name: row.fromName } : { email: row.fromEmail },
    replyTo: row.replyTo,
    subject: row.subject,
    templateId: row.templateId,
    tags: row.tags,
    metadata,
    error: row.lastError,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
  };
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** One email of this workspace, or null (unknown id, or another workspace's). */
export async function getTransactionalEmail(workspaceId: string, id: string): Promise<PublicEmail | null> {
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  const row = await db.transactionalEmail.findFirst({ where: { id, workspaceId }, select: PUBLIC_EMAIL_SELECT });
  return row ? toPublicEmail(row) : null;
}

// ── Listing (newest first, keyset pagination) ────────────────────────────────

export type ListTransactionalOptions = {
  /** 1–100, default 20. */
  limit?: number;
  /** The `nextCursor` of the previous page. */
  cursor?: string | null;
  status?: TransactionalStatusName | Lowercase<TransactionalStatusName> | null;
  apiKeyId?: string | null;
  /** Exact recipient address (case doesn't matter). */
  to?: string | null;
  tag?: string | null;
};

export type ListTransactionalResult = { data: PublicEmail[]; nextCursor: string | null };

export const LIST_LIMIT_DEFAULT = 20;
export const LIST_LIMIT_MAX = 100;

/**
 * The cursor is the last row's (createdAt, id), as base64url JSON. It's
 * "opaque": callers just pass it back. A broken cursor = the first page.
 * Keyset pagination (instead of OFFSET) stays fast on page 1,000 and never
 * skips or repeats rows when new emails arrive meanwhile.
 */
function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify([row.createdAt.toISOString(), row.id])).toString("base64url");
}

function decodeCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!cursor || typeof cursor !== "string" || cursor.length > 200) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [at, id] = parsed;
    const createdAt = new Date(String(at));
    if (Number.isNaN(createdAt.getTime()) || typeof id !== "string" || !ID_RE.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function statusFilter(status: ListTransactionalOptions["status"]): TransactionalStatus | null {
  if (!status) return null;
  const upper = String(status).toUpperCase();
  return (TRANSACTIONAL_STATUSES as readonly string[]).includes(upper) ? (upper as TransactionalStatus) : null;
}

export async function listTransactionalEmails(
  workspaceId: string,
  opts: ListTransactionalOptions = {},
): Promise<ListTransactionalResult> {
  const limit = Math.min(LIST_LIMIT_MAX, Math.max(1, Math.floor(Number(opts.limit)) || LIST_LIMIT_DEFAULT));
  const where: Prisma.TransactionalEmailWhereInput = { workspaceId };

  const status = statusFilter(opts.status);
  if (status) where.status = status;
  if (opts.apiKeyId) where.apiKeyId = opts.apiKeyId;
  if (opts.to) where.toEmail = String(opts.to).trim().toLowerCase();
  if (opts.tag) where.tags = { has: String(opts.tag).trim() };

  const cursor = decodeCursor(opts.cursor);
  if (cursor) {
    // "Older than the last row": (createdAt, id) < (cursor.createdAt, cursor.id).
    where.OR = [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }];
  }

  const rows = await db.transactionalEmail.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1, // one extra tells us whether there's a next page
    select: PUBLIC_EMAIL_SELECT,
  });
  const page = rows.slice(0, limit);
  return {
    data: page.map(toPublicEmail),
    nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
  };
}

// ── Dashboard: stats ─────────────────────────────────────────────────────────

export type TransactionalStats = {
  days: number;
  /** Emails accepted in the period. */
  total: number;
  /** Every status, 0 when none. */
  byStatus: Record<TransactionalStatusName, number>;
  /** One entry per day (UTC here; the workspace time zone in the range version), oldest first, zero-filled. */
  daily: { day: string; total: number; byStatus: Record<TransactionalStatusName, number> }[];
  /** The most used tags in the period (up to 10). */
  topTags: { tag: string; count: number }[];
};

function emptyCounts(): Record<TransactionalStatusName, number> {
  return Object.fromEntries(TRANSACTIONAL_STATUSES.map((s) => [s, 0])) as Record<TransactionalStatusName, number>;
}

/** Counts for the last `days` days (1–90, default 7), by UTC day. */
export async function getTransactionalStats(workspaceId: string, opts: { days?: number } = {}): Promise<TransactionalStats> {
  const days = Math.min(90, Math.max(1, Math.floor(Number(opts.days)) || 7));
  const now = new Date();
  // From the start of the first day (UTC), so every day in the chart is complete.
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  const sinceSql = Prisma.sql`${since}::timestamp`;

  const [perDay, tags] = await Promise.all([
    db.$queryRaw<{ day: string; status: TransactionalStatusName; n: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, status::text AS status, count(*)::int AS n
      FROM transactional_email
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${sinceSql}
      GROUP BY 1, 2`),
    db.$queryRaw<{ tag: string; count: number }[]>(Prisma.sql`
      SELECT t.tag, count(*)::int AS count
      FROM transactional_email e, unnest(e.tags) AS t(tag)
      WHERE e."workspaceId" = ${workspaceId} AND e."createdAt" >= ${sinceSql}
      GROUP BY t.tag
      ORDER BY count DESC, t.tag ASC
      LIMIT 10`),
  ]);

  const daily: TransactionalStats["daily"] = [];
  const index = new Map<string, TransactionalStats["daily"][number]>();
  for (let i = 0; i < days; i++) {
    const day = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const entry = { day, total: 0, byStatus: emptyCounts() };
    daily.push(entry);
    index.set(day, entry);
  }
  const byStatus = emptyCounts();
  let total = 0;
  for (const r of perDay) {
    const entry = index.get(r.day);
    if (!entry || !(r.status in byStatus)) continue;
    entry.total += r.n;
    entry.byStatus[r.status] += r.n;
    byStatus[r.status] += r.n;
    total += r.n;
  }
  return { days, total, byStatus, daily, topTags: tags };
}

/**
 * Counts for a date range (Transactional → Statistics), by calendar day in
 * the WORKSPACE time zone. `from` / `to` are "YYYY-MM-DD", both included,
 * already checked and limited to 366 days (see src/lib/statistics/range.ts).
 * An email counts on the day it was accepted (createdAt), with its status now.
 */
export async function getTransactionalStatsForRange(
  workspaceId: string,
  range: { from: string; to: string },
  timezone: string,
): Promise<TransactionalStats & { from: string; to: string }> {
  const fromAt = startOfDay(range.from, timezone);
  const toAt = startOfDay(dayAfter(range.to), timezone);
  const from = Prisma.sql`${fromAt}::timestamp`;
  const to = Prisma.sql`${toAt}::timestamp`;

  const [perDay, tags] = await Promise.all([
    db.$queryRaw<{ day: string; status: TransactionalStatusName; n: number }[]>(Prisma.sql`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}::text, 'YYYY-MM-DD') AS day,
             status::text AS status, count(*)::int AS n
      FROM transactional_email
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1, 2`),
    db.$queryRaw<{ tag: string; count: number }[]>(Prisma.sql`
      SELECT t.tag, count(*)::int AS count
      FROM transactional_email e, unnest(e.tags) AS t(tag)
      WHERE e."workspaceId" = ${workspaceId} AND e."createdAt" >= ${from} AND e."createdAt" < ${to}
      GROUP BY t.tag
      ORDER BY count DESC, t.tag ASC
      LIMIT 10`),
  ]);

  const daily: TransactionalStats["daily"] = [];
  const index = new Map<string, TransactionalStats["daily"][number]>();
  for (let day = range.from; day <= range.to && daily.length <= 366; day = dayAfter(day)) {
    const entry = { day, total: 0, byStatus: emptyCounts() };
    daily.push(entry);
    index.set(day, entry);
  }
  const byStatus = emptyCounts();
  let total = 0;
  for (const r of perDay) {
    const entry = index.get(r.day);
    if (!entry || !(r.status in byStatus)) continue;
    entry.total += r.n;
    entry.byStatus[r.status] += r.n;
    byStatus[r.status] += r.n;
    total += r.n;
  }
  return { days: daily.length, from: range.from, to: range.to, total, byStatus, daily, topTags: tags };
}

// ── Dashboard: one email in full ─────────────────────────────────────────────

export type TransactionalDetail = PublicEmail & {
  source: string;
  /** The Idempotency-Key the caller sent, if any. */
  idempotencyKey: string | null;
  /** null once cleared by the retention job (or never kept, e.g. an erased address). */
  html: string | null;
  text: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  providerMessageId: string | null;
  contactId: string | null;
  apiKey: { id: string; name: string; prefix: string; revoked: boolean } | null;
  sender: { id: string; email: string; name: string } | null;
  provider: { id: string; name: string; type: string } | null;
  template: { id: string; name: string } | null;
  updatedAt: string;
};

export async function getTransactionalDetail(workspaceId: string, id: string): Promise<TransactionalDetail | null> {
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  const row = await db.transactionalEmail.findFirst({
    where: { id, workspaceId },
    select: {
      ...PUBLIC_EMAIL_SELECT,
      source: true,
      idempotencyKey: true,
      html: true,
      text: true,
      attempts: true,
      nextAttemptAt: true,
      providerMessageId: true,
      contactId: true,
      updatedAt: true,
      apiKey: { select: { id: true, name: true, prefix: true, revokedAt: true } },
      sender: { select: { id: true, email: true, name: true } },
      provider: { select: { id: true, name: true, type: true } },
      template: { select: { id: true, name: true } },
    },
  });
  if (!row) return null;
  return {
    ...toPublicEmail(row),
    source: row.source,
    idempotencyKey: row.idempotencyKey ? userIdempotencyKey(row.idempotencyKey) : null,
    html: row.html || null,
    text: row.text || null,
    attempts: row.attempts,
    // Only meaningful while it's waiting to be (re)tried.
    nextAttemptAt: row.status === "QUEUED" ? row.nextAttemptAt.toISOString() : null,
    providerMessageId: row.providerMessageId,
    contactId: row.contactId,
    apiKey: row.apiKey
      ? { id: row.apiKey.id, name: row.apiKey.name, prefix: row.apiKey.prefix, revoked: row.apiKey.revokedAt !== null }
      : null,
    sender: row.sender,
    provider: row.provider ? { id: row.provider.id, name: row.provider.name, type: row.provider.type } : null,
    template: row.template,
    updatedAt: row.updatedAt.toISOString(),
  };
}
