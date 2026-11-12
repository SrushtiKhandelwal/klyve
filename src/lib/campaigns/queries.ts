import "server-only";
import { z } from "zod";
import { Prisma, type CampaignStatus, type RecipientStatus } from "@/generated/prisma/client";
import { audienceSchema, readAudience, type Audience } from "@/lib/campaigns/audience";
import { CAMPAIGN_STATUSES, RECIPIENT_STATUSES } from "@/lib/campaigns/status";
import { getBrandTheme } from "@/lib/brand-kit";
import { db } from "@/lib/db";
import { emailDocumentSchema, emptyDocument, withFreshIds, type EmailDocument } from "@/lib/templates/document";
import { TEMPLATE_LIMITS, getTemplate, validateDocument } from "@/lib/templates/queries";
import { buildStarter, getStarterMeta } from "@/lib/templates/starters";

// Data Access Layer for campaigns.
//
// SECURITY (multi-tenant isolation): every function takes the workspace id
// FIRST and every query filters by it. ONLY pass the id from
// requireActiveWorkspace(). A campaign/list/segment/sender id from the
// browser is always used TOGETHER with that workspace id, so another
// workspace's id simply finds nothing.
//
// RACES: status changes are conditional writes (`updateMany` with the
// expected status in the WHERE). The database applies them one at a time, so
// if two requests (or a request and the background worker) race, exactly one
// wins and the other sees count = 0.

/** A workspace id, or the ActiveWorkspace object (its name is used for the brand theme). */
export type WorkspaceArg = string | { id: string; name?: string };
export const wsId = (ws: WorkspaceArg) => (typeof ws === "string" ? ws : ws.id);

/** A problem the user can fix; its message is safe to show as is. */
export class CampaignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignError";
  }
}

export const CAMPAIGN_LIMITS = {
  nameMax: 100,
  subjectMax: TEMPLATE_LIMITS.subjectMax,
  preheaderMax: TEMPLATE_LIMITS.preheaderMax,
  /** Rows per page in the recipients table. */
  recipientsPageSize: 50,
  /** Most campaigns we list at once. */
  listMax: 500,
} as const;

export const NOT_FOUND = "This campaign doesn't exist (or was deleted).";
export const NOT_EDITABLE = "This campaign has already been scheduled or sent, so it can't be edited. Duplicate it to make changes.";

// ── Validation ──────────────────────────────────────────────────────────────

// Line breaks in a subject could sneak extra email headers in, so control
// characters are not allowed in any single-line field.
const noControlChars = (v: string) => ![...v].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f);

export const campaignNameSchema = z
  .string()
  .trim()
  .min(1, "Give the campaign a name.")
  .max(CAMPAIGN_LIMITS.nameMax, `Keep the name under ${CAMPAIGN_LIMITS.nameMax} characters.`)
  .refine(noControlChars, "The name can't contain line breaks.");

export const campaignSubjectSchema = z
  .string()
  .trim()
  .max(CAMPAIGN_LIMITS.subjectMax, `Keep the subject under ${CAMPAIGN_LIMITS.subjectMax} characters.`)
  .refine(noControlChars, "The subject can't contain line breaks.");

export const campaignPreheaderSchema = z
  .string()
  .trim()
  .max(CAMPAIGN_LIMITS.preheaderMax, `Keep the preview text under ${CAMPAIGN_LIMITS.preheaderMax} characters.`)
  .refine(noControlChars, "The preview text can't contain line breaks.");

const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "Something isn't valid.";

const isCampaignStatus = (v: unknown): v is CampaignStatus => (CAMPAIGN_STATUSES as readonly unknown[]).includes(v);
const isRecipientStatus = (v: unknown): v is RecipientStatus => (RECIPIENT_STATUSES as readonly unknown[]).includes(v);
const cleanId = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null);

// ── Reading ─────────────────────────────────────────────────────────────────

export type CampaignListItem = {
  id: string;
  name: string;
  status: CampaignStatus;
  subject: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  /** Phase 5: were opens/clicks tracked, and the unique-person engagement counters. */
  trackOpens: boolean;
  trackClicks: boolean;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  complaintCount: number;
  unsubscribeCount: number;
  /** e.g. "Acme News <news@acme.com>", or null if no sender is picked. */
  senderLabel: string | null;
};

/** The tracking switches + engagement counters (for the open/click rate columns). */
const ENGAGEMENT_SELECT = {
  trackOpens: true,
  trackClicks: true,
  openCount: true,
  clickCount: true,
  bounceCount: true,
  complaintCount: true,
  unsubscribeCount: true,
} as const;

const senderLabel = (s: { name: string; email: string } | null) => (s ? `${s.name} <${s.email}>` : null);

/** Campaigns, newest first. `q` searches name and subject; `status` filters. */
export async function listCampaigns(
  workspaceId: string,
  options: { q?: string; status?: string } = {},
): Promise<CampaignListItem[]> {
  const q = options.q?.trim().slice(0, 100);
  const rows = await db.campaign.findMany({
    where: {
      workspaceId,
      ...(isCampaignStatus(options.status) ? { status: options.status } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: CAMPAIGN_LIMITS.listMax,
    select: {
      id: true,
      name: true,
      status: true,
      subject: true,
      scheduledAt: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      updatedAt: true,
      recipientCount: true,
      sentCount: true,
      failedCount: true,
      skippedCount: true,
      ...ENGAGEMENT_SELECT,
      sender: { select: { name: true, email: true } },
    },
  });
  return rows.map(({ sender, ...row }) => ({ ...row, senderLabel: senderLabel(sender) }));
}

export type CampaignDetail = Omit<CampaignListItem, "senderLabel"> & {
  preheader: string;
  audience: Audience;
  /** The campaign's own design; null if it has none yet or it can't be read. */
  document: EmailDocument | null;
  templateId: string | null;
  lastError: string | null;
  createdById: string | null;
  sender: { id: string; email: string; name: string; replyTo: string | null; verified: boolean } | null;
  /**
   * The provider used to send. Fixed at launch; for a draft it's the one that
   * WOULD be used (the sender's provider, else the workspace default).
   */
  provider: { id: string; name: string; type: string; status: string } | null;
};

const PROVIDER_SELECT = { id: true, name: true, type: true, status: true } as const;

/** One campaign with everything the editor/progress pages need, or null. */
export async function getCampaign(workspaceId: string, campaignId: string): Promise<CampaignDetail | null> {
  const id = cleanId(campaignId);
  if (!id) return null;
  const row = await db.campaign.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      name: true,
      status: true,
      subject: true,
      preheader: true,
      audience: true,
      document: true,
      templateId: true,
      scheduledAt: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      updatedAt: true,
      recipientCount: true,
      sentCount: true,
      failedCount: true,
      skippedCount: true,
      ...ENGAGEMENT_SELECT,
      lastError: true,
      createdById: true,
      // The relation filters are a second safety net: only same-workspace rows.
      sender: { select: { id: true, email: true, name: true, replyTo: true, verifiedAt: true, workspaceId: true, providerId: true } },
      provider: { select: { ...PROVIDER_SELECT, workspaceId: true } },
    },
  });
  if (!row) return null;

  const sender = row.sender?.workspaceId === workspaceId ? row.sender : null;
  let provider = row.provider?.workspaceId === workspaceId ? row.provider : null;
  if (!provider && row.status === "DRAFT") {
    provider = await db.sendingProvider.findFirst({
      where: sender?.providerId ? { id: sender.providerId, workspaceId } : { workspaceId, isDefault: true },
      select: { ...PROVIDER_SELECT, workspaceId: true },
      orderBy: { updatedAt: "desc" },
    });
  }
  const parsedDoc = row.document ? emailDocumentSchema.safeParse(row.document) : null;

  return {
    ...row,
    audience: readAudience(row.audience),
    document: parsedDoc?.success ? parsedDoc.data : null,
    sender: sender
      ? { id: sender.id, email: sender.email, name: sender.name, replyTo: sender.replyTo, verified: sender.verifiedAt !== null }
      : null,
    provider: provider ? { id: provider.id, name: provider.name, type: provider.type, status: provider.status } : null,
  };
}

// ── Creating and editing ────────────────────────────────────────────────────

/**
 * Creates a DRAFT. Content comes from a saved template or a starter (a COPY
 * with fresh ids, so later template edits never change the campaign), else a
 * blank email in the workspace's brand. Throws CampaignError on bad input.
 */
export async function createCampaign(
  ws: WorkspaceArg,
  userId: string,
  input: { name?: string; templateId?: string | null; starterId?: string | null },
): Promise<{ id: string }> {
  const workspaceId = wsId(ws);
  let document: EmailDocument;
  let subject = "";
  let preheader = "";
  let templateId: string | null = null;
  let defaultName = "Untitled campaign";

  if (input.templateId) {
    const template = await getTemplate(workspaceId, input.templateId);
    if (!template) throw new CampaignError("That template doesn't exist (or was deleted).");
    document = withFreshIds(template.document);
    subject = template.subject;
    preheader = template.preheader;
    templateId = template.id;
    defaultName = template.name;
  } else if (input.starterId) {
    const meta = getStarterMeta(input.starterId);
    if (!meta) throw new CampaignError("That starter template doesn't exist.");
    document = buildStarter(meta.id, await getBrandTheme(ws))!; // buildStarter already gives fresh ids
    subject = meta.subject;
    preheader = meta.preheader;
    defaultName = meta.name;
  } else {
    document = emptyDocument(await getBrandTheme(ws));
  }

  const name = campaignNameSchema.safeParse(input.name?.trim() ? input.name : defaultName);
  if (!name.success) throw new CampaignError(firstIssue(name.error));

  // Helpful default: with exactly ONE verified sender there's nothing to choose.
  const verified = await db.sender.findMany({
    where: { workspaceId, verifiedAt: { not: null } },
    select: { id: true },
    take: 2,
  });

  const row = await db.campaign.create({
    data: {
      workspaceId,
      name: name.data,
      status: "DRAFT",
      subject: subject.slice(0, CAMPAIGN_LIMITS.subjectMax),
      preheader: preheader.slice(0, CAMPAIGN_LIMITS.preheaderMax),
      document: document as Prisma.InputJsonValue,
      templateId,
      audience: { listIds: [], segmentIds: [], excludeListIds: [], excludeSegmentIds: [] },
      senderId: verified.length === 1 ? verified[0].id : null,
      createdById: userId,
    },
    select: { id: true },
  });
  return row;
}

export type DraftPatch = {
  name?: unknown;
  subject?: unknown;
  preheader?: unknown;
  /** A verified sender of this workspace, or null to clear. */
  senderId?: unknown;
  audience?: unknown;
  document?: unknown;
  /** Phase 5 tracking switches (booleans). */
  trackOpens?: unknown;
  trackClicks?: unknown;
};

export type UpdateResult = { ok: true } | { ok: false; error: string };

/** Saves changes to a DRAFT. Every field is validated; ids must belong to this workspace. */
export async function updateCampaignDraft(workspaceId: string, campaignId: string, patch: DraftPatch): Promise<UpdateResult> {
  const id = cleanId(campaignId);
  if (!id) return { ok: false, error: NOT_FOUND };
  const data: Prisma.CampaignUncheckedUpdateManyInput = {};

  if (patch.name !== undefined) {
    const r = campaignNameSchema.safeParse(patch.name);
    if (!r.success) return { ok: false, error: firstIssue(r.error) };
    data.name = r.data;
  }
  if (patch.subject !== undefined) {
    const r = campaignSubjectSchema.safeParse(patch.subject);
    if (!r.success) return { ok: false, error: firstIssue(r.error) };
    data.subject = r.data;
  }
  if (patch.preheader !== undefined) {
    const r = campaignPreheaderSchema.safeParse(patch.preheader);
    if (!r.success) return { ok: false, error: firstIssue(r.error) };
    data.preheader = r.data;
  }
  if (patch.senderId !== undefined) {
    if (patch.senderId === null || patch.senderId === "") {
      data.senderId = null;
    } else {
      const senderId = cleanId(patch.senderId);
      const sender = senderId
        ? await db.sender.findFirst({ where: { id: senderId, workspaceId }, select: { id: true, verifiedAt: true } })
        : null;
      if (!sender) return { ok: false, error: "That sender doesn't exist in this workspace." };
      if (!sender.verifiedAt) return { ok: false, error: "That sender isn't verified yet. Verify it in Settings → Senders first." };
      data.senderId = sender.id;
    }
  }
  if (patch.audience !== undefined) {
    const checked = await validateAudienceForWorkspace(workspaceId, patch.audience);
    if (!checked.ok) return checked;
    data.audience = checked.audience as Prisma.InputJsonValue;
  }
  if (patch.document !== undefined) {
    const checked = validateDocument(patch.document);
    if (!checked.ok) return checked;
    data.document = checked.document as Prisma.InputJsonValue;
  }
  if (patch.trackOpens !== undefined) {
    if (typeof patch.trackOpens !== "boolean") return { ok: false, error: "Open tracking must be on or off." };
    data.trackOpens = patch.trackOpens;
  }
  if (patch.trackClicks !== undefined) {
    if (typeof patch.trackClicks !== "boolean") return { ok: false, error: "Click tracking must be on or off." };
    data.trackClicks = patch.trackClicks;
  }
  if (Object.keys(data).length === 0) return { ok: true };

  // Only a DRAFT can change: the status is part of the WHERE, so a campaign
  // that launched a split second ago is never edited.
  const result = await db.campaign.updateMany({ where: { id, workspaceId, status: "DRAFT" }, data });
  if (result.count === 1) return { ok: true };
  const exists = await db.campaign.findFirst({ where: { id, workspaceId }, select: { id: true } });
  return { ok: false, error: exists ? NOT_EDITABLE : NOT_FOUND };
}

/**
 * Checks an audience from the browser: the right shape, no repeated ids, and
 * every list/segment exists IN THIS WORKSPACE (others are rejected, not ignored).
 */
export async function validateAudienceForWorkspace(
  workspaceId: string,
  input: unknown,
): Promise<{ ok: true; audience: Audience } | { ok: false; error: string }> {
  const parsed = audienceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The audience isn't valid. Please pick your lists and segments again." };
  const audience: Audience = {
    listIds: [...new Set(parsed.data.listIds)],
    segmentIds: [...new Set(parsed.data.segmentIds)],
    excludeListIds: [...new Set(parsed.data.excludeListIds)],
    excludeSegmentIds: [...new Set(parsed.data.excludeSegmentIds)],
  };
  const listIds = [...new Set([...audience.listIds, ...audience.excludeListIds])];
  const segmentIds = [...new Set([...audience.segmentIds, ...audience.excludeSegmentIds])];
  const [lists, segments] = await Promise.all([
    listIds.length ? db.contactList.count({ where: { workspaceId, id: { in: listIds } } }) : 0,
    segmentIds.length ? db.segment.count({ where: { workspaceId, id: { in: segmentIds } } }) : 0,
  ]);
  if (lists !== listIds.length) return { ok: false, error: "One of the chosen lists doesn't exist in this workspace." };
  if (segments !== segmentIds.length) return { ok: false, error: "One of the chosen segments doesn't exist in this workspace." };
  return { ok: true, audience };
}

/** Copies any campaign (even a sent one) as a new DRAFT named "… (copy)". Throws CampaignError if not found. */
export async function duplicateCampaign(workspaceId: string, userId: string, campaignId: string): Promise<{ id: string }> {
  const id = cleanId(campaignId);
  const source = id
    ? await db.campaign.findFirst({
        where: { id, workspaceId },
        select: {
          name: true,
          subject: true,
          preheader: true,
          senderId: true,
          audience: true,
          document: true,
          templateId: true,
          trackOpens: true,
          trackClicks: true,
        },
      })
    : null;
  if (!source) throw new CampaignError(NOT_FOUND);

  // Keep the sender only if it's still a verified sender of this workspace.
  const sender = source.senderId
    ? await db.sender.findFirst({ where: { id: source.senderId, workspaceId, verifiedAt: { not: null } }, select: { id: true } })
    : null;
  const suffix = " (copy)";
  const name = source.name.slice(0, CAMPAIGN_LIMITS.nameMax - suffix.length).trimEnd() + suffix;
  const parsedDoc = source.document ? emailDocumentSchema.safeParse(source.document) : null;

  return db.campaign.create({
    data: {
      workspaceId,
      name,
      status: "DRAFT",
      subject: source.subject,
      preheader: source.preheader,
      senderId: sender?.id ?? null,
      audience: readAudience(source.audience) as Prisma.InputJsonValue,
      document: parsedDoc?.success ? (withFreshIds(parsedDoc.data) as Prisma.InputJsonValue) : Prisma.JsonNull,
      templateId: source.templateId,
      // Keep the tracking choice: someone who turned tracking off wants it off in the copy too.
      trackOpens: source.trackOpens,
      trackClicks: source.trackClicks,
      createdById: userId,
    },
    select: { id: true },
  });
}

/** Campaigns in these states can be deleted (the worker never touches them). */
const DELETABLE: CampaignStatus[] = ["DRAFT", "SENT", "CANCELLED", "FAILED"];

/**
 * Deletes a campaign (and its recipient rows). Only when it isn't scheduled,
 * sending or paused. OWNER/ADMIN may delete any campaign; a MEMBER only their own.
 */
export async function deleteCampaign(
  workspaceId: string,
  campaignId: string,
  actor: { role: "OWNER" | "ADMIN" | "MEMBER"; userId: string },
): Promise<UpdateResult> {
  const id = cleanId(campaignId);
  const row = id ? await db.campaign.findFirst({ where: { id, workspaceId }, select: { id: true, createdById: true, status: true } }) : null;
  if (!row) return { ok: false, error: NOT_FOUND };
  if (!canDeleteCampaign(actor, row.createdById)) {
    return { ok: false, error: "Only workspace owners and admins can delete campaigns made by someone else." };
  }
  // The allowed statuses are part of the WHERE, so a campaign that was just
  // scheduled/launched by someone else is never deleted mid-send.
  const result = await db.campaign.deleteMany({ where: { id: row.id, workspaceId, status: { in: DELETABLE } } });
  if (result.count === 0) {
    return { ok: false, error: "This campaign is scheduled or sending. Cancel it first, then delete it." };
  }
  return { ok: true };
}

/** Shared rule so the page can hide the Delete button when it wouldn't work. */
export function canDeleteCampaign(actor: { userId: string; role: string }, createdById: string | null): boolean {
  return actor.role === "OWNER" || actor.role === "ADMIN" || (createdById !== null && createdById === actor.userId);
}

// ── Progress and recipients ─────────────────────────────────────────────────

export type CampaignProgress = {
  status: CampaignStatus;
  counts: Record<RecipientStatus, number>;
  total: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
};

/** Live counts per recipient status (counted from the rows, so always exact). */
export async function getCampaignProgress(workspaceId: string, campaignId: string): Promise<CampaignProgress | null> {
  const id = cleanId(campaignId);
  const campaign = id
    ? await db.campaign.findFirst({
        where: { id, workspaceId },
        select: { id: true, status: true, startedAt: true, finishedAt: true, lastError: true },
      })
    : null;
  if (!campaign) return null;
  const groups = await db.campaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId: campaign.id },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(RECIPIENT_STATUSES.map((s) => [s, 0])) as Record<RecipientStatus, number>;
  for (const g of groups) counts[g.status] = g._count._all;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    status: campaign.status,
    counts,
    total,
    startedAt: campaign.startedAt,
    finishedAt: campaign.finishedAt,
    lastError: campaign.lastError,
  };
}

export type RecipientRow = {
  id: string;
  email: string;
  status: RecipientStatus;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  /** Phase 5 engagement (null/0 = didn't happen, or wasn't tracked). */
  firstOpenedAt: Date | null;
  openCount: number;
  firstClickedAt: Date | null;
  clickCount: number;
  /** Set for a HARD bounce (the address doesn't exist). */
  bouncedAt: Date | null;
  bounceType: string | null;
  /** Only temporary bounces (mailbox full…): stored as events, not on the row. */
  softBounced: boolean;
  complainedAt: Date | null;
  unsubscribedAt: Date | null;
};

export type RecipientsPage = { rows: RecipientRow[]; total: number; page: number; pageCount: number };

/** The engagement filter chips on the status page (one at a time). */
export const ENGAGEMENT_FILTERS = ["opened", "clicked", "not_opened", "bounced", "complained", "unsubscribed"] as const;
export type EngagementFilter = (typeof ENGAGEMENT_FILTERS)[number];

const isEngagementFilter = (v: unknown): v is EngagementFilter => (ENGAGEMENT_FILTERS as readonly unknown[]).includes(v);

/** What each engagement chip means, as a database filter. */
const ENGAGEMENT_WHERE: Record<EngagementFilter, Prisma.CampaignRecipientWhereInput> = {
  opened: { firstOpenedAt: { not: null } },
  clicked: { firstClickedAt: { not: null } },
  // "Didn't open" only makes sense for emails that actually went out.
  not_opened: { status: "SENT", firstOpenedAt: null },
  // Hard bounces are on the row; soft ones only exist as events (index: recipientId, type).
  bounced: { OR: [{ bouncedAt: { not: null } }, { events: { some: { type: "BOUNCED" } } }] },
  complained: { complainedAt: { not: null } },
  unsubscribed: { unsubscribedAt: { not: null } },
};

/**
 * One page (50) of a campaign's recipients, optionally filtered by status OR
 * engagement (opened, clicked, …) and by an email search.
 */
export async function listCampaignRecipients(
  workspaceId: string,
  campaignId: string,
  options: { status?: string; engagement?: string; q?: string; page?: number } = {},
): Promise<RecipientsPage> {
  const empty: RecipientsPage = { rows: [], total: 0, page: 1, pageCount: 1 };
  const id = cleanId(campaignId);
  const campaign = id ? await db.campaign.findFirst({ where: { id, workspaceId }, select: { id: true } }) : null;
  if (!campaign) return empty;

  const q = options.q?.trim().slice(0, 100);
  const where: Prisma.CampaignRecipientWhereInput = {
    campaignId: campaign.id,
    ...(isRecipientStatus(options.status) ? { status: options.status } : {}),
    ...(isEngagementFilter(options.engagement) ? ENGAGEMENT_WHERE[options.engagement] : {}),
    ...(q ? { email: { contains: q, mode: "insensitive" } } : {}),
  };
  const size = CAMPAIGN_LIMITS.recipientsPageSize;
  const total = await db.campaignRecipient.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / size));
  // ?page=999 or ?page=-3 shouldn't break the page: show the nearest real page.
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1) || 1), pageCount);
  const rows = await db.campaignRecipient.findMany({
    where,
    orderBy: [{ email: "asc" }, { id: "asc" }],
    skip: (page - 1) * size,
    take: size,
    select: {
      id: true,
      email: true,
      status: true,
      attempts: true,
      lastError: true,
      sentAt: true,
      firstOpenedAt: true,
      openCount: true,
      firstClickedAt: true,
      clickCount: true,
      bouncedAt: true,
      bounceType: true,
      complainedAt: true,
      unsubscribedAt: true,
      _count: { select: { events: { where: { type: "BOUNCED" } } } },
    },
  });
  return {
    rows: rows.map(({ _count, ...row }) => ({ ...row, softBounced: !row.bouncedAt && _count.events > 0 })),
    total,
    page,
    pageCount,
  };
}
