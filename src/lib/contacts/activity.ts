import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// A contact's email history ("activity timeline") and engagement summary.
//
// Where the data comes from:
//  - "Sent <campaign>":  campaign_recipient rows with a sentAt.
//  - Opened / Clicked / Bounced / Marked as spam / Unsubscribed: email_event.
//    Opens and clicks by bots (privacy scanners, link checkers) are hidden;
//    we only count how many were hidden.
//
// SAFETY: every query is scoped by the campaign's workspaceId (the recipient
// table has no workspaceId of its own), so a contact id from another
// workspace simply has no activity here. Pages still check the contact exists
// in the workspace first and show "not found" otherwise.
//
// SPEED: campaign_recipient has no index on contactId, so every query starts
// from the workspace's campaigns and probes the (campaignId, contactId)
// unique index: one quick lookup per campaign. Events are then found through
// the (recipientId, type) index.

/** Items per page in the timeline. */
export const ACTIVITY_PAGE_SIZE = 30;

export type ContactActivityKind = "SENT" | "OPENED" | "CLICKED" | "BOUNCED" | "COMPLAINED" | "UNSUBSCRIBED";

export type ContactActivityItem = {
  /** Unique within the timeline ("sent_<recipientId>" or the event id). */
  id: string;
  kind: ContactActivityKind;
  at: Date;
  campaignId: string;
  campaignName: string;
  /** CLICKED: the link's address (null if the link was removed). */
  url: string | null;
  /** BOUNCED: "hard" (address doesn't exist) or "soft" (temporary). */
  bounceType: "hard" | "soft" | null;
};

export type ContactActivityPage = {
  items: ContactActivityItem[];
  /** Pass back as `cursor` to load older items; null when there are no more. */
  nextCursor: string | null;
  /** Automated (bot) opens and clicks that were left out. Only counted on the first page. */
  automatedHidden: number;
};

type ActivityRow = {
  id: string;
  kind: string;
  at: Date;
  campaignId: string;
  campaignName: string;
  url: string | null;
  bounceType: string | null;
};

// The cursor is "<ISO time>|<item id>" of the last item shown. Ids are cuids
// (letters, digits) with an optional "sent_" prefix.
const CURSOR_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([A-Za-z0-9_-]{1,80})$/;

function encodeCursor(item: ContactActivityItem): string {
  return `${item.at.toISOString()}|${item.id}`;
}

function decodeCursor(cursor: string | null | undefined): { at: string; id: string } | null {
  if (typeof cursor !== "string") return null;
  const m = CURSOR_PATTERN.exec(cursor);
  if (!m || Number.isNaN(Date.parse(m[1]))) return null;
  return { at: m[1], id: m[2] };
}

/**
 * The contact's email history, newest first, ACTIVITY_PAGE_SIZE at a time.
 * Only pass a workspaceId from requireActiveWorkspace(). An unknown or
 * malformed cursor starts from the newest item.
 */
export async function getContactActivity(
  workspaceId: string,
  contactId: string,
  { cursor }: { cursor?: string | null } = {},
): Promise<ContactActivityPage> {
  const after = decodeCursor(cursor);
  // Keyset pagination: strictly older than the last item shown (ties broken by id).
  // Timestamps are stored as UTC without a zone; the "Z" in the ISO text is ignored by ::timestamp.
  const olderThan = after
    ? Prisma.sql`WHERE t.at < ${after.at}::timestamp
        OR (t.at = ${after.at}::timestamp AND t.id COLLATE "C" < ${after.id}::text COLLATE "C")`
    : Prisma.empty;

  const [rows, automatedHidden] = await Promise.all([
    db.$queryRaw<ActivityRow[]>`
      WITH mine AS (
        SELECT cr.id, cr."sentAt", cr."bounceType", ca.id AS "campaignId", ca.name AS "campaignName"
        FROM campaign ca
        JOIN campaign_recipient cr ON cr."campaignId" = ca.id
        WHERE ca."workspaceId" = ${workspaceId} AND cr."contactId" = ${contactId}
      )
      SELECT t.* FROM (
        SELECT 'sent_' || m.id AS id, 'SENT' AS kind, m."sentAt" AS at,
               m."campaignId", m."campaignName", NULL::text AS url, NULL::text AS "bounceType"
        FROM mine m
        WHERE m."sentAt" IS NOT NULL
        UNION ALL
        SELECT e.id, e.type::text, e."createdAt",
               m."campaignId", m."campaignName", l.url,
               CASE WHEN e.type = 'BOUNCED' THEN COALESCE(e.detail ->> 'bounceType', m."bounceType") END
        FROM mine m
        JOIN email_event e ON e."recipientId" = m.id
        LEFT JOIN campaign_link l ON l.id = e."linkId"
        WHERE e."isBot" = false
          AND e.type <> 'DELIVERED'
          -- A click without a pixel load also records an "implied" open at the
          -- same moment; showing both would be noise.
          AND NOT (e.type = 'OPENED' AND COALESCE(e.detail ->> 'impliedByClick', '') = 'true')
      ) t
      ${olderThan}
      ORDER BY t.at DESC, t.id COLLATE "C" DESC
      LIMIT ${ACTIVITY_PAGE_SIZE + 1}
    `,
    after ? Promise.resolve(0) : countAutomatedEvents(workspaceId, contactId),
  ]);

  const items = rows.slice(0, ACTIVITY_PAGE_SIZE).map(toItem);
  const hasMore = rows.length > ACTIVITY_PAGE_SIZE;
  return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null, automatedHidden };
}

function toItem(r: ActivityRow): ContactActivityItem {
  return {
    id: r.id,
    kind: r.kind as ContactActivityKind,
    at: r.at,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    url: r.kind === "CLICKED" ? r.url : null,
    bounceType: r.bounceType === "hard" ? "hard" : r.bounceType ? "soft" : null,
  };
}

async function countAutomatedEvents(workspaceId: string, contactId: string): Promise<number> {
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM campaign ca
    JOIN campaign_recipient cr ON cr."campaignId" = ca.id
    JOIN email_event e ON e."recipientId" = cr.id
    WHERE ca."workspaceId" = ${workspaceId} AND cr."contactId" = ${contactId} AND e."isBot" = true
  `;
  return rows[0]?.n ?? 0;
}

// ─────────────────────────────────────────────
// Summary strip
// ─────────────────────────────────────────────

export type ContactEngagementSummary = {
  /** Campaigns actually sent to this contact. */
  received: number;
  /** Of those, how many hard-bounced (left out of the rates, like campaign reports). */
  bounced: number;
  /** Received campaigns they opened (a click counts as an open), real people only. */
  opened: number;
  /** Received campaigns they clicked a link in, real people only. */
  clicked: number;
  /** Their most recent real open or click. */
  lastOpenedAt: Date | null;
};

/**
 * Per-contact totals for the summary strip. "Opened" and "clicked" use the
 * recipient's firstOpenedAt / firstClickedAt, which the tracking recorder
 * only sets for real people (and a first click also sets firstOpenedAt).
 */
export async function getContactEngagementSummary(
  workspaceId: string,
  contactId: string,
): Promise<ContactEngagementSummary> {
  const rows = await db.$queryRaw<ContactEngagementSummary[]>`
    SELECT
      count(*) FILTER (WHERE cr.status = 'SENT')::int AS received,
      count(*) FILTER (WHERE cr.status = 'SENT' AND cr."bouncedAt" IS NOT NULL)::int AS bounced,
      count(*) FILTER (WHERE cr.status = 'SENT'
        AND (cr."firstOpenedAt" IS NOT NULL OR cr."firstClickedAt" IS NOT NULL))::int AS opened,
      count(*) FILTER (WHERE cr.status = 'SENT' AND cr."firstClickedAt" IS NOT NULL)::int AS clicked,
      (SELECT max(e."createdAt")
         FROM email_event e
        WHERE e."recipientId" = ANY (array_agg(cr.id))
          AND e.type IN ('OPENED', 'CLICKED') AND e."isBot" = false) AS "lastOpenedAt"
    FROM campaign ca
    JOIN campaign_recipient cr ON cr."campaignId" = ca.id
    WHERE ca."workspaceId" = ${workspaceId} AND cr."contactId" = ${contactId}
  `;
  return rows[0] ?? { received: 0, bounced: 0, opened: 0, clicked: 0, lastOpenedAt: null };
}

// ─────────────────────────────────────────────
// Contacts table: one aggregate query per page
// ─────────────────────────────────────────────

export type EngagementBadge = "ACTIVE" | "INACTIVE" | "NEVER_OPENED" | "NOT_EMAILED";

/** "Inactive" = no real open or click in this many days. */
export const INACTIVE_AFTER_DAYS = 90;

export type ContactEngagementBrief = {
  badge: EngagementBadge;
  /** Most recent real open or click, if any. */
  lastActivityAt: Date | null;
};

/**
 * Engagement for one page of contacts, in ONE query:
 *  - ACTIVE:       opened or clicked in the last 90 days
 *  - INACTIVE:     opened before, but not in the last 90 days
 *  - NEVER_OPENED: was sent at least one campaign, never opened
 *  - NOT_EMAILED:  never sent a campaign
 * Contact ids not in this workspace simply come back as NOT_EMAILED.
 */
export async function getEngagementForContacts(
  workspaceId: string,
  contactIds: string[],
): Promise<Map<string, ContactEngagementBrief>> {
  const result = new Map<string, ContactEngagementBrief>();
  const ids = [...new Set(contactIds)].filter((id) => typeof id === "string" && id.length <= 64).slice(0, 500);
  if (ids.length === 0) return result;

  const rows = await db.$queryRaw<{ contactId: string; received: number; lastActivityAt: Date | null }[]>`
    SELECT cr."contactId" AS "contactId",
           count(*) FILTER (WHERE cr.status = 'SENT')::int AS received,
           (SELECT max(e."createdAt")
              FROM email_event e
             WHERE e."recipientId" = ANY (array_agg(cr.id))
               AND e.type IN ('OPENED', 'CLICKED') AND e."isBot" = false) AS "lastActivityAt"
    FROM campaign ca
    JOIN campaign_recipient cr ON cr."campaignId" = ca.id
    WHERE ca."workspaceId" = ${workspaceId} AND cr."contactId" = ANY (${ids}::text[])
    GROUP BY cr."contactId"
  `;

  const activeSince = Date.now() - INACTIVE_AFTER_DAYS * 86_400_000;
  for (const r of rows) {
    const badge: EngagementBadge = r.lastActivityAt
      ? r.lastActivityAt.getTime() >= activeSince
        ? "ACTIVE"
        : "INACTIVE"
      : r.received > 0
        ? "NEVER_OPENED"
        : "NOT_EMAILED";
    result.set(r.contactId, { badge, lastActivityAt: r.lastActivityAt });
  }
  return result;
}
