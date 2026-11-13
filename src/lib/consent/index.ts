import "server-only";
import { db } from "@/lib/db";
import { hashIp } from "@/lib/tracking/ip";
import type { ConsentEventType, Prisma } from "@/generated/prisma/client";

// The consent record: an append-only audit trail of who agreed to what,
// when and how. Anti-spam and privacy laws (GDPR, CAN-SPAM, India's DPDP)
// expect a sender to be able to PROVE a person agreed to get their emails.
//
// Rules:
//  - Writing a consent event must NEVER break the thing being recorded
//    (an unsubscribe, an import...). So recordConsent logs errors instead of
//    throwing: the person's request matters more than our paperwork.
//  - IP addresses are personal data, so only a keyed hash is stored (hashIp).
//  - Rows are kept when a contact is deleted (contactId becomes null), so the
//    proof survives. A GDPR erasure replaces the address with a hash.

export type { ConsentEventType };

export type ConsentInput = {
  workspaceId: string;
  contactId?: string | null;
  /** The address at the time of the event. */
  email: string;
  type: ConsentEventType;
  /** Where it happened, e.g. "form", "import", "unsubscribe_link", "confirmation_link". */
  source: string;
  /** The visitor's raw IP. Never stored: only its hash is. */
  ip?: string | null;
  userAgent?: string | null;
  /** Extra facts, e.g. { importId, lists }. Must be JSON-safe. */
  detail?: Record<string, unknown> | null;
  /** The logged-in team member who did it (for changes made in the dashboard). */
  userId?: string | null;
};

const MAX_USER_AGENT = 200;
const MAX_SOURCE = 50;
const MAX_EMAIL = 320;

/** Turns one input into a database row (hashing the IP, trimming long text). */
function toRow(input: ConsentInput): Prisma.ConsentEventCreateManyInput {
  const userAgent = input.userAgent?.trim().slice(0, MAX_USER_AGENT) || null;
  return {
    workspaceId: input.workspaceId,
    contactId: input.contactId ?? null,
    email: input.email.trim().toLowerCase().slice(0, MAX_EMAIL),
    type: input.type,
    source: (input.source || "unknown").slice(0, MAX_SOURCE),
    ipHash: hashIp(input.ip),
    userAgent,
    // JSON.parse(JSON.stringify(...)) drops undefined values and Dates become
    // strings, so whatever callers pass is safe to store as JSON.
    detail: input.detail ? (JSON.parse(JSON.stringify(input.detail)) as Prisma.InputJsonValue) : undefined,
    createdById: input.userId ?? null,
  };
}

/** Records one consent event. Never throws (errors are logged). */
export async function recordConsent(input: ConsentInput): Promise<void> {
  try {
    await db.consentEvent.create({ data: toRow(input) });
  } catch (error) {
    console.error(`[consent] couldn't record ${input.type} for workspace ${input.workspaceId}:`, error);
  }
}

/** Records many events in ONE insert (for imports). Never throws. */
export async function recordConsentMany(rows: ConsentInput[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    // createMany sends a single INSERT, so 10,000 imported rows don't mean
    // 10,000 round trips. Chunked so one statement never gets huge.
    const data = rows.map(toRow);
    for (let i = 0; i < data.length; i += 5000) {
      await db.consentEvent.createMany({ data: data.slice(i, i + 5000) });
    }
  } catch (error) {
    console.error(`[consent] couldn't record ${rows.length} events:`, error);
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

export type ConsentEventRow = {
  id: string;
  type: ConsentEventType;
  source: string;
  email: string;
  /** True when an IP (hash) was recorded. The hash itself is proof, not for display. */
  hasIp: boolean;
  ipHash: string | null;
  userAgent: string | null;
  detail: Record<string, unknown> | null;
  createdAt: Date;
  /** The team member who made the change, if it was done in the dashboard. */
  createdBy: { id: string; name: string; email: string } | null;
};

const PAGE_SIZE = 25;

/**
 * A contact's consent history, newest first, 25 at a time.
 * Pass the previous page's `nextCursor` to get the next page.
 * Always filtered by workspace: another workspace's contact gives no rows.
 */
export async function listConsentEvents(
  workspaceId: string,
  contactId: string,
  opts: { cursor?: string | null } = {},
): Promise<{ rows: ConsentEventRow[]; nextCursor: string | null }> {
  const events = await db.consentEvent.findMany({
    where: { workspaceId, contactId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1, // one extra tells us whether there's another page
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      source: true,
      email: true,
      ipHash: true,
      userAgent: true,
      detail: true,
      createdAt: true,
      createdById: true,
    },
  });

  const page = events.slice(0, PAGE_SIZE);
  const nextCursor = events.length > PAGE_SIZE ? page[page.length - 1].id : null;

  // Who did it: only users who are (still) members of THIS workspace are
  // named, so a row can never reveal someone from another workspace.
  const userIds = [...new Set(page.map((e) => e.createdById).filter((id): id is string => !!id))];
  const members = userIds.length
    ? await db.workspaceMember.findMany({
        where: { workspaceId, userId: { in: userIds } },
        select: { user: { select: { id: true, name: true, email: true } } },
      })
    : [];
  const byId = new Map(members.map((m) => [m.user.id, m.user]));

  const rows = page.map(({ createdById, ipHash, detail, ...e }) => ({
    ...e,
    hasIp: !!ipHash,
    ipHash,
    detail: detail && typeof detail === "object" && !Array.isArray(detail) ? (detail as Record<string, unknown>) : null,
    createdBy: createdById ? (byId.get(createdById) ?? null) : null,
  }));
  return { rows, nextCursor };
}
