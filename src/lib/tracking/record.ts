import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/contacts/common";
import { db } from "@/lib/db";
import { addSuppressions } from "@/lib/suppression";
import { hashIp } from "@/lib/tracking/ip";

// THE place every engagement event goes through: opens and clicks (from the
// /t/... tracking links) and delivered / bounced / complained / unsubscribed
// (from provider webhooks and the unsubscribe page).
//
// For each event it, in ONE database transaction:
//   1. appends an EmailEvent row (the history, for timelines), and
//   2. keeps the summary counters in step, so reports never have to count
//      millions of events:
//        CampaignRecipient  first time + totals for this one email
//        Campaign           UNIQUE people (each person counted once per type)
//        CampaignLink       total and unique clicks per link
//   3. updates the contact for bounces/complaints/unsubscribes, and
//   4. adds hard bounces and complaints to the workspace's suppression list,
//      so the address is never emailed again, even if the contact is deleted
//      and re-imported. Unsubscribes are NOT added: the contact's UNSUBSCRIBED
//      status already stops campaigns, and the person must stay able to
//      re-subscribe (preference centre, forms) without anyone having to dig
//      a suppression row out first. See src/lib/suppression/index.ts.
//
// SAFETY
//  - The caller only names the recipient. The campaign and workspace are read
//    from that recipient's row, so an event can never land in another
//    workspace, whatever the caller passes.
//  - The recipient row is locked (SELECT … FOR UPDATE) first, so two events
//    for the same person (say a double webhook delivery) are handled one
//    after the other: the second sees the first and is ignored. Counters can
//    never be counted twice.
//  - Bad input never throws: it returns { recorded: false }. (A database
//    outage DOES throw, so a webhook can answer "try again later".)
//
// RULES (industry standard, same as Brevo/Mailchimp)
//  - Bot events (Apple privacy prefetch, security scanners…) are stored with
//    isBot = true but don't change any counter.
//  - A click means the email was opened, even if images were blocked (no
//    pixel load). So the first click also counts as an open if there wasn't one.
//  - DELIVERED / COMPLAINED / UNSUBSCRIBED: at most one event per recipient.
//    BOUNCED: at most one "soft" and one "hard" (a hard one ends it).
//  - OPENED / CLICKED: the very same event (same person, link and IP) again
//    within 10 seconds is a duplicate (double-loaded image, double click).

export type RecordEventInput = {
  recipientId: string;
  type: "DELIVERED" | "OPENED" | "CLICKED" | "BOUNCED" | "COMPLAINED" | "UNSUBSCRIBED";
  linkId?: string;
  isBot?: boolean;
  userAgent?: string;
  ip?: string;
  detail?: Record<string, unknown>;
  at?: Date;
};

export type RecordEventResult = {
  /** false = ignored (unknown recipient, bad input or a duplicate). */
  recorded: boolean;
  /** true = this person's first (human) event of this type, i.e. a unique counter went up. */
  firstOfType: boolean;
};

type EventType = RecordEventInput["type"];

const EVENT_TYPES = new Set<EventType>(["DELIVERED", "OPENED", "CLICKED", "BOUNCED", "COMPLAINED", "UNSUBSCRIBED"]);
/** Same open/click again within this time = a duplicate. */
const DUPLICATE_WINDOW_SECONDS = 10;
/** We keep a short user agent only (enough to show "Gmail on iPhone"). */
const USER_AGENT_MAX = 200;
/** Detail JSON bigger than this is cut down to its key facts. */
const DETAIL_MAX_CHARS = 4_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const NOT_RECORDED: RecordEventResult = { recorded: false, firstOfType: false };

// ── Input clean-up ───────────────────────────────────────────────────────────

type CleanEvent = {
  recipientId: string;
  type: EventType;
  linkId: string | null;
  isBot: boolean;
  userAgent: string | null;
  ipHash: string | null;
  detail: Record<string, unknown> | null;
  bounceType: "hard" | "soft" | null;
  at: Date;
};

/** Checks and tidies the caller's input. null = unusable. */
function clean(input: RecordEventInput): CleanEvent | null {
  if (!input || typeof input !== "object") return null;
  const { recipientId, type } = input;
  if (typeof recipientId !== "string" || !ID_PATTERN.test(recipientId)) return null;
  if (!EVENT_TYPES.has(type)) return null;

  const engagement = type === "OPENED" || type === "CLICKED";
  const linkId = type === "CLICKED" && typeof input.linkId === "string" && ID_PATTERN.test(input.linkId) ? input.linkId : null;

  // "at": a real date, and not in the future (a wrong clock can't move the timeline).
  const now = new Date();
  const at = input.at instanceof Date && !Number.isNaN(input.at.getTime()) && input.at <= now ? input.at : now;

  let detail = isPlainObject(input.detail) ? { ...input.detail } : null;
  // Unknown or missing bounce type → "soft": we only block an address when
  // the provider says clearly that it doesn't exist.
  const bounceType = type === "BOUNCED" ? (detail?.bounceType === "hard" ? "hard" : "soft") : null;
  if (bounceType) detail = { ...(detail ?? {}), bounceType };

  const userAgent = typeof input.userAgent === "string" ? input.userAgent.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, USER_AGENT_MAX) : "";

  return {
    recipientId,
    type,
    linkId,
    // Only opens and clicks can be "bots"; a bounce is a bounce.
    isBot: engagement && input.isBot === true,
    userAgent: userAgent || null,
    ipHash: typeof input.ip === "string" ? hashIp(input.ip) : null,
    detail: limitDetail(detail),
    bounceType,
    at,
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Keeps detail JSON small and valid. Too big → only short, simple values survive. */
function limitDetail(detail: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!detail) return null;
  let json: string | undefined;
  try {
    json = JSON.stringify(detail);
  } catch {
    json = undefined; // e.g. a circular object
  }
  if (json !== undefined && json.length <= DETAIL_MAX_CHARS) return JSON.parse(json) as Record<string, unknown>;
  const small: Record<string, unknown> = { truncated: true };
  for (const [key, value] of Object.entries(detail).slice(0, 20)) {
    if (typeof value === "number" || typeof value === "boolean") small[key] = value;
    else if (typeof value === "string") small[key] = value.slice(0, 150);
  }
  return small;
}

/** Event ids made here (raw SQL), in the same style as Prisma's: lowercase letters/digits. */
function newEventId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return "e" + Array.from(randomBytes(24), (b) => alphabet[b % alphabet.length]).join("");
}

// ── Recording ────────────────────────────────────────────────────────────────

type LockedRecipient = {
  id: string;
  campaignId: string;
  workspaceId: string;
  campaignName: string;
  contactId: string | null;
  email: string;
  firstOpenedAt: Date | null;
  firstClickedAt: Date | null;
  bounceType: string | null;
  linkId: string | null;
};

type PriorEvents = {
  /** An event that makes this one a duplicate. */
  duplicate: boolean;
  /** This person clicked this link before (as a human). */
  linkClickedBefore: boolean;
  /** Any bounce recorded before (for firstOfType). */
  bouncedBefore: boolean;
};

/**
 * Records one event and updates every counter. See the notes at the top.
 * Returns { recorded: false } for unknown recipients, bad input and duplicates.
 */
export async function recordEvent(input: RecordEventInput): Promise<RecordEventResult> {
  const e = clean(input);
  if (!e) return NOT_RECORDED;

  return db.$transaction(async (tx) => {
    // 1. Lock this recipient (other events for them wait here) and read the
    //    campaign/workspace FROM THE DATABASE. A link id only counts if it
    //    belongs to the same campaign.
    const rows = await tx.$queryRaw<LockedRecipient[]>(Prisma.sql`
      SELECT r.id, r."campaignId", c."workspaceId", c.name AS "campaignName", r."contactId", r.email,
             r."firstOpenedAt", r."firstClickedAt", r."bounceType", l.id AS "linkId"
      FROM campaign_recipient r
      JOIN campaign c ON c.id = r."campaignId"
      LEFT JOIN campaign_link l ON l.id = ${e.linkId}::text AND l."campaignId" = r."campaignId"
      WHERE r.id = ${e.recipientId}
      FOR UPDATE OF r`);
    const r = rows[0];
    if (!r) return NOT_RECORDED;

    // 2. Is it a duplicate? (Safe to check now: we hold the lock.)
    const prior = await findPriorEvents(tx, e, r);
    if (prior.duplicate) return NOT_RECORDED;

    // 3. Work out every change, then write them all in one statement.
    const w = new Writes(e, r);
    let firstOfType = false;
    const human = !e.isBot;

    switch (e.type) {
      case "OPENED":
        if (human) {
          firstOfType = !r.firstOpenedAt;
          w.countOpen(firstOfType);
        }
        break;

      case "CLICKED":
        if (human) {
          firstOfType = !r.firstClickedAt;
          w.recipient.push(Prisma.sql`"clickCount" = "clickCount" + 1`, Prisma.sql`"firstClickedAt" = COALESCE("firstClickedAt", ${w.at})`);
          if (firstOfType) w.campaign.push(Prisma.sql`"clickCount" = "clickCount" + 1`);
          if (r.linkId) {
            w.link.push(Prisma.sql`"clickCount" = "clickCount" + 1`);
            if (!prior.linkClickedBefore) w.link.push(Prisma.sql`"uniqueClicks" = "uniqueClicks" + 1`);
          }
          // Clicked without a recorded open (images were off): that's an open too.
          if (!r.firstOpenedAt) {
            w.events.push(w.eventRow("OPENED", null, { impliedByClick: true }));
            w.countOpen(true);
          }
        }
        break;

      case "DELIVERED":
        firstOfType = true;
        w.recipient.push(Prisma.sql`"deliveredAt" = COALESCE("deliveredAt", ${w.at})`);
        break;

      case "BOUNCED":
        firstOfType = !prior.bouncedBefore;
        if (e.bounceType === "hard") {
          // The address doesn't exist: remember it, count it once, and stop
          // emailing it (BOUNCED contacts are never sent to again).
          w.recipient.push(Prisma.sql`"bouncedAt" = ${w.at}`, Prisma.sql`"bounceType" = 'hard'`);
          if (r.bounceType !== "hard") w.campaign.push(Prisma.sql`"bounceCount" = "bounceCount" + 1`);
          w.contactStatus = { to: "BOUNCED", from: ["SUBSCRIBED", "UNSUBSCRIBED"] };
        }
        // Soft bounces (mailbox full, server busy…) are only recorded: the
        // next email may well arrive.
        // LATER IMPROVEMENT: 3 soft bounces in a row across campaigns → BOUNCED.
        break;

      case "COMPLAINED":
        // Marked as spam: the strongest "stop" there is. Overrides every
        // other status, and the campaign's complaint counter goes up once.
        firstOfType = true;
        w.recipient.push(Prisma.sql`"complainedAt" = COALESCE("complainedAt", ${w.at})`);
        w.campaign.push(Prisma.sql`"complaintCount" = "complaintCount" + 1`);
        w.contactStatus = { to: "COMPLAINED", from: ["SUBSCRIBED", "UNSUBSCRIBED", "BOUNCED"] };
        break;

      case "UNSUBSCRIBED":
        // Counted once per recipient. Also applies the unsubscribe itself, so
        // a provider's unsubscribe webhook has the same effect as our page
        // (both are no-ops when the page already did it).
        firstOfType = true;
        w.recipient.push(Prisma.sql`"unsubscribedAt" = COALESCE("unsubscribedAt", ${w.at})`);
        w.campaign.push(Prisma.sql`"unsubscribeCount" = "unsubscribeCount" + 1`);
        w.contactStatus = { to: "UNSUBSCRIBED", from: ["SUBSCRIBED"] };
        break;
    }

    await tx.$executeRaw(w.toSql());
    if (w.contactStatus) await updateContactStatus(tx, r, w.contactStatus);
    // Same transaction: the event and the suppression are saved together or not at all.
    if (e.type === "BOUNCED" && e.bounceType === "hard") {
      await suppress(tx, r, "HARD_BOUNCE", `Hard bounce from the campaign “${r.campaignName}”`);
    } else if (e.type === "COMPLAINED") {
      await suppress(tx, r, "COMPLAINT", `Marked the campaign “${r.campaignName}” as spam`);
    }
    return { recorded: true, firstOfType };
  });
}

/** One query that answers every "has this happened before?" question for this event. */
async function findPriorEvents(tx: Prisma.TransactionClient, e: CleanEvent, r: LockedRecipient): Promise<PriorEvents> {
  const at = Prisma.sql`${e.at}::timestamp`;
  const window = Prisma.raw(`interval '${DUPLICATE_WINDOW_SECONDS} seconds'`); // a constant, not user input
  let duplicate: Prisma.Sql;
  if (e.type === "OPENED" || e.type === "CLICKED") {
    duplicate = Prisma.sql`EXISTS (
      SELECT 1 FROM email_event
      WHERE "recipientId" = ${r.id} AND type = ${e.type}::"EmailEventType"
        AND "linkId" IS NOT DISTINCT FROM ${r.linkId}::text
        AND "ipHash" IS NOT DISTINCT FROM ${e.ipHash}::text
        AND "createdAt" BETWEEN ${at} - ${window} AND ${at} + ${window})`;
  } else if (e.type === "BOUNCED") {
    // A hard bounce ends it; otherwise one of each kind.
    duplicate = Prisma.sql`EXISTS (
      SELECT 1 FROM email_event
      WHERE "recipientId" = ${r.id} AND type = 'BOUNCED'
        AND (detail->>'bounceType' = 'hard' OR detail->>'bounceType' = ${e.bounceType}))`;
  } else {
    duplicate = Prisma.sql`EXISTS (SELECT 1 FROM email_event WHERE "recipientId" = ${r.id} AND type = ${e.type}::"EmailEventType")`;
  }

  const rows = await tx.$queryRaw<PriorEvents[]>(Prisma.sql`
    SELECT ${duplicate} AS duplicate,
      EXISTS (SELECT 1 FROM email_event
              WHERE "recipientId" = ${r.id} AND type = 'CLICKED' AND NOT "isBot"
                AND "linkId" = ${r.linkId}::text) AS "linkClickedBefore",
      EXISTS (SELECT 1 FROM email_event WHERE "recipientId" = ${r.id} AND type = 'BOUNCED') AS "bouncedBefore"`);
  return rows[0];
}

type ContactChange = { to: "BOUNCED" | "COMPLAINED" | "UNSUBSCRIBED"; from: ("SUBSCRIBED" | "UNSUBSCRIBED" | "BOUNCED")[] };

/**
 * Changes the contact's status, only from the allowed statuses (a bounce
 * never overwrites a complaint, for example). If the contact was deleted, an
 * address re-added later in the SAME workspace is updated instead: the
 * mailbox's owner (or its server) is the same.
 */
async function updateContactStatus(tx: Prisma.TransactionClient, r: LockedRecipient, change: ContactChange): Promise<void> {
  const where = r.contactId
    ? { id: r.contactId, workspaceId: r.workspaceId }
    : { workspaceId: r.workspaceId, email: normalizeEmail(r.email) };
  await tx.contact.updateMany({ where: { ...where, status: { in: change.from } }, data: { status: change.to } });
}

/**
 * Puts this recipient's address on the workspace's suppression list. The
 * workspace comes from the locked recipient row (never from the caller).
 * Already there (e.g. bounced before, then complained) → left as it was.
 */
async function suppress(
  tx: Prisma.TransactionClient,
  r: LockedRecipient,
  reason: "HARD_BOUNCE" | "COMPLAINT",
  note: string,
): Promise<void> {
  await addSuppressions(r.workspaceId, [{ email: r.email, reason, note: note.slice(0, 300) }], { client: tx });
}

/**
 * Collects the changes for one event, then turns them into ONE SQL statement:
 *   WITH e AS (INSERT INTO email_event …), r AS (UPDATE campaign_recipient …), … SELECT 1
 * Postgres runs every part of a WITH that writes, exactly once, all or nothing.
 *
 * Campaign counters are updated with raw SQL on purpose: Prisma would also
 * change campaign.updatedAt, which the sending worker uses to notice edits.
 */
class Writes {
  readonly at: Prisma.Sql;
  events: Prisma.Sql[] = [];
  recipient: Prisma.Sql[] = [];
  campaign: Prisma.Sql[] = [];
  link: Prisma.Sql[] = [];
  contactStatus: ContactChange | null = null;

  constructor(
    private readonly e: CleanEvent,
    private readonly r: LockedRecipient,
  ) {
    this.at = Prisma.sql`${e.at}::timestamp`;
    this.events.push(this.eventRow(e.type, r.linkId, e.detail));
  }

  /** VALUES (…) for one email_event row. */
  eventRow(type: EventType, linkId: string | null, detail: Record<string, unknown> | null): Prisma.Sql {
    const { e, r } = this;
    return Prisma.sql`(${newEventId()}, ${r.workspaceId}, ${r.campaignId}, ${r.id}, ${type}::"EmailEventType",
      ${linkId}::text, ${e.isBot}, ${e.userAgent}::text, ${e.ipHash}::text,
      ${detail ? JSON.stringify(detail) : null}::jsonb, ${this.at})`;
  }

  /** A human open: recipient total, first time, and (if new) the unique counter. */
  countOpen(first: boolean): void {
    this.recipient.push(Prisma.sql`"openCount" = "openCount" + 1`, Prisma.sql`"firstOpenedAt" = COALESCE("firstOpenedAt", ${this.at})`);
    if (first) this.campaign.push(Prisma.sql`"openCount" = "openCount" + 1`);
  }

  toSql(): Prisma.Sql {
    const parts: Prisma.Sql[] = [
      Prisma.sql`ev AS (
        INSERT INTO email_event (id, "workspaceId", "campaignId", "recipientId", type, "linkId", "isBot", "userAgent", "ipHash", detail, "createdAt")
        VALUES ${Prisma.join(this.events)})`,
    ];
    if (this.recipient.length) {
      parts.push(Prisma.sql`rec AS (UPDATE campaign_recipient SET ${Prisma.join(this.recipient)} WHERE id = ${this.r.id})`);
    }
    if (this.campaign.length) {
      parts.push(Prisma.sql`camp AS (UPDATE campaign SET ${Prisma.join(this.campaign)} WHERE id = ${this.r.campaignId})`);
    }
    if (this.link.length && this.r.linkId) {
      parts.push(Prisma.sql`lnk AS (UPDATE campaign_link SET ${Prisma.join(this.link)} WHERE id = ${this.r.linkId})`);
    }
    return Prisma.sql`WITH ${Prisma.join(parts)} SELECT 1`;
  }
}
