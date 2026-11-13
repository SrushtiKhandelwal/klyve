import "server-only";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@/generated/prisma/client";
import { resolveProvider } from "@/lib/campaigns/checks";
import { db } from "@/lib/db";
import type { AutomationTrigger, SendEmailStep } from "@/lib/automations/schema";
import { notSuppressedSql } from "@/lib/suppression";
import { emailDocumentSchema } from "@/lib/templates/document";
import { TemplateError, compileTemplate, documentMergeTagErrors } from "@/lib/templates/personalize";
import { InvalidDocumentError, renderDocument } from "@/lib/templates/render";
import { CLICK_BASE_TAG, prepareTrackedHtml, type TrackedLink } from "@/lib/tracking/links";

// The emails of an automation.
//
// Every "Send email" step gets its own HIDDEN campaign (kind AUTOMATION), so
// automation emails reuse the whole campaign sending engine: the worker sends
// them with tracking, unsubscribe links, the suppression check and the
// provider's speed limit. The campaign stays SENDING while the automation
// lives; when someone reaches the step we add ONE CampaignRecipient row and
// the worker does the rest.
//
//   automation ──┬─ step "Welcome"  → campaign (automationStepId = "st_abc")
//                └─ step "Tips"     → campaign (automationStepId = "st_def")
//
// "Never twice": CampaignRecipient is unique per (campaign, contact), and we
// insert with ON CONFLICT DO NOTHING, so retrying a step can't queue a second
// email. The same person going through the automation AGAIN (re-entry) also
// hits that rule: the email step is skipped for them ("email_already_sent").
//
// Birthdays/anniversaries happen every year, so for that trigger each step
// gets one campaign PER YEAR (automationStepId = "st_abc:2026"); the unique
// rule then means "once per person per year".

/** Problems found while preparing a step's email (plain English, safe to show). */
export type EmailProblem = string;

/** A step's email, rendered and ready to freeze into its hidden campaign. */
export type StepEmailContent = {
  subject: string;
  preheader: string;
  senderId: string;
  providerId: string;
  /** HTML with tracking ({{ tracking.click_base }}/<n> links + open pixel). */
  html: string;
  text: string;
  links: TrackedLink[];
  /** The step's design, kept on the campaign (used to spot edits on re-activation). */
  document: unknown;
};

/** Same id style as launch.ts: lowercase letters/digits only (recipient tokens require that). */
function newRecipientId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return "r" + Array.from(randomBytes(24), (b) => alphabet[b % alphabet.length]).join("");
}

// ── Keys: which hidden campaign belongs to which step (and year) ────────────

/** "2026"-style occurrences (birthday runs) get a campaign per year. */
const YEAR_RE = /^\d{4}$/;

/**
 * The automationStepId of the campaign a run uses for a step: the step id, or
 * "stepId:year" for date-anniversary automations (one campaign per year).
 */
export function stepCampaignKey(trigger: AutomationTrigger, stepId: string, occurrence: string | null): string {
  if (trigger.type === "date_anniversary" && occurrence && YEAR_RE.test(occurrence)) return `${stepId}:${occurrence}`;
  return stepId;
}

/** "st_abc:2026" → "st_abc". */
export function stepIdOfKey(key: string): string {
  const i = key.indexOf(":");
  return i === -1 ? key : key.slice(0, i);
}

/** "st_abc:2026" → "2026" (null for a plain step id). */
function yearOfKey(key: string): string | null {
  const i = key.indexOf(":");
  return i === -1 ? null : key.slice(i + 1);
}

// ── Rendering + checks ───────────────────────────────────────────────────────

/**
 * Checks and renders one "Send email" step, like the campaign pre-send checks
 * (checks.ts): a VERIFIED sender of this workspace, a working provider
 * (the sender's own, else the workspace default), valid merge tags, a design
 * that renders. Returns the content to freeze, or the problems.
 */
export async function renderStepEmail(
  workspaceId: string,
  step: SendEmailStep,
): Promise<{ ok: true; content: StepEmailContent } | { ok: false; problems: EmailProblem[] }> {
  const label = `“${step.name}”`;
  const problems: EmailProblem[] = [];

  const sender = step.senderId
    ? await db.sender.findFirst({
        where: { id: step.senderId, workspaceId },
        select: { id: true, email: true, verifiedAt: true, providerId: true },
      })
    : null;
  if (!sender) problems.push(`${label}: choose who it's from (a verified sender of this workspace).`);
  else if (!sender.verifiedAt) problems.push(`${label}: the sender ${sender.email} isn't verified yet.`);

  const provider = sender ? await resolveProvider(workspaceId, sender.providerId) : null;
  if (sender && !provider) {
    problems.push(`${label}: there's no email provider to send through. Connect one in Settings → Providers.`);
  } else if (provider?.status === "FAILED") {
    problems.push(`${label}: the email provider “${provider.name}” isn't working. Fix it and test it again.`);
  }

  if (!step.subject.trim()) problems.push(`${label}: add a subject line.`);

  const doc = emailDocumentSchema.safeParse(step.document);
  if (!doc.success) {
    problems.push(`${label}: the email design has a problem. Open it in the editor and save it again.`);
    return { ok: false, problems };
  }
  for (const message of documentMergeTagErrors(doc.data, { subject: step.subject, preheader: step.preheader })) {
    problems.push(`${label}: ${message}`);
  }
  const blocks = doc.data.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));
  if (blocks.some((b) => b.type === "image" && !b.src.trim())) {
    problems.push(`${label}: an image block has no picture yet. Add one or remove the block.`);
  }

  let rendered: { html: string; text: string };
  try {
    rendered = await renderDocument(doc.data, { subject: step.subject, preheader: step.preheader });
  } catch (error) {
    if (!(error instanceof InvalidDocumentError)) throw error;
    problems.push(`${label}: ${error.message}`);
    return { ok: false, problems };
  }
  // Parse the FINAL email once, exactly as the sender will, so the worker
  // never fails every recipient on the same broken tag.
  if (problems.length === 0) {
    try {
      compileTemplate({ html: rendered.html, text: rendered.text, subject: step.subject });
    } catch (error) {
      if (!(error instanceof TemplateError)) throw error;
      problems.push(`${label}: ${error.message}`);
    }
  }
  if (problems.length > 0 || !sender || !provider) return { ok: false, problems };

  // Automation emails always track opens and clicks: the if/else step
  // "did they open / click?" depends on it.
  const tracked = prepareTrackedHtml(rendered.html, { trackOpens: true, trackClicks: true });
  return {
    ok: true,
    content: {
      subject: step.subject,
      preheader: step.preheader,
      senderId: sender.id,
      providerId: provider.id,
      html: tracked.html,
      text: rendered.text,
      links: tracked.links,
      document: doc.data,
    },
  };
}

// ── Writing the hidden campaigns ─────────────────────────────────────────────

type Tx = Prisma.TransactionClient;
type AutomationRef = { id: string; workspaceId: string; name: string };

function campaignName(automationName: string, step: SendEmailStep, key: string): string {
  const year = yearOfKey(key);
  return `${automationName} – ${step.name}${year ? ` (${year})` : ""}`.slice(0, 200);
}

/**
 * Shifts every tracked link number in the HTML by `offset`:
 * {{ tracking.click_base }}/0 → {{ tracking.click_base }}/7.
 * Used when an email that was already sent is edited: its OLD links keep
 * their numbers (so clicks in emails already delivered still go to the right
 * place) and the new version's links are added after them.
 */
function shiftLinkPositions(html: string, offset: number): string {
  if (offset === 0) return html;
  const escaped = CLICK_BASE_TAG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(new RegExp(`href="${escaped}/(\\d+)"`, "g"), (_m, n: string) => `href="${CLICK_BASE_TAG}/${Number(n) + offset}"`);
}

/**
 * Creates or updates the hidden campaign of one step (and year), and makes it
 * SENDING. Safe to call again with the same content (nothing changes).
 *
 * Editing an email that already has recipients updates it IN PLACE (the
 * report keeps one history per step), but the links of the old version are
 * kept and the new ones get new numbers, so a click in an old email never
 * goes to a different address.
 */
export async function writeStepCampaign(
  tx: Tx,
  automation: AutomationRef,
  step: SendEmailStep,
  key: string,
  content: StepEmailContent,
  options: { now: Date; userId: string | null },
): Promise<string> {
  const name = campaignName(automation.name, step, key);
  const existing = await tx.campaign.findFirst({
    where: { automationId: automation.id, automationStepId: key },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      status: true,
      subject: true,
      preheader: true,
      senderId: true,
      providerId: true,
      document: true,
    },
  });

  if (!existing) {
    const created = await tx.campaign.create({
      data: {
        workspaceId: automation.workspaceId,
        kind: "AUTOMATION",
        automationId: automation.id,
        automationStepId: key,
        name,
        status: "SENDING",
        subject: content.subject,
        preheader: content.preheader,
        senderId: content.senderId,
        providerId: content.providerId,
        document: content.document as Prisma.InputJsonValue,
        html: content.html,
        text: content.text,
        trackOpens: true,
        trackClicks: true,
        startedAt: options.now,
        createdById: options.userId,
      },
      select: { id: true },
    });
    if (content.links.length > 0) {
      await tx.campaignLink.createMany({
        data: content.links.map((l) => ({ campaignId: created.id, position: l.position, url: l.url })),
        skipDuplicates: true,
      });
    }
    return created.id;
  }
  if (existing.workspaceId !== automation.workspaceId) throw new Error("Hidden campaign belongs to another workspace.");

  // The name isn't part of the email: a renamed automation only renames its campaigns.
  const unchanged =
    existing.subject === content.subject &&
    existing.preheader === content.preheader &&
    existing.senderId === content.senderId &&
    existing.providerId === content.providerId &&
    isDeepStrictEqual(existing.document, content.document);

  if (unchanged) {
    // Same email. Only make sure it's sending again (it may have been paused
    // by a provider failure or the sending-health check; activation has just
    // re-checked the sender and provider).
    if (existing.status !== "SENDING" || existing.name !== name) {
      await tx.campaign.update({ where: { id: existing.id }, data: { name, status: "SENDING", lastError: null, finishedAt: null } });
    }
    return existing.id;
  }

  // Changed: new links go after the old ones if anyone may have the old email.
  const hasRecipients = (await tx.campaignRecipient.count({ where: { campaignId: existing.id }, take: 1 })) > 0;
  let html = content.html;
  let links = content.links;
  if (hasRecipients) {
    const last = await tx.campaignLink.findFirst({
      where: { campaignId: existing.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const offset = last ? last.position + 1 : 0;
    html = shiftLinkPositions(content.html, offset);
    links = content.links.map((l) => ({ position: l.position + offset, url: l.url }));
  } else {
    await tx.campaignLink.deleteMany({ where: { campaignId: existing.id } });
  }
  if (links.length > 0) {
    await tx.campaignLink.createMany({
      data: links.map((l) => ({ campaignId: existing.id, position: l.position, url: l.url })),
      skipDuplicates: true,
    });
  }
  await tx.campaign.update({
    where: { id: existing.id },
    data: {
      name,
      subject: content.subject,
      preheader: content.preheader,
      senderId: content.senderId,
      providerId: content.providerId,
      document: content.document as Prisma.InputJsonValue,
      html,
      text: content.text,
      status: "SENDING",
      lastError: null,
      finishedAt: null,
    },
  });
  return existing.id;
}

/**
 * Activation: makes the hidden campaigns match the steps.
 *  - every "Send email" step gets its campaign (created or updated);
 *    birthday automations get this year's and next year's;
 *  - a campaign whose step was REMOVED is deleted only if nobody was ever
 *    queued for it; otherwise it's kept (its history stays in reports) but
 *    no new recipients are ever added.
 */
export async function syncAutomationCampaigns(
  tx: Tx,
  automation: AutomationRef & { trigger: AutomationTrigger },
  emails: { step: SendEmailStep; content: StepEmailContent }[],
  options: { now: Date; userId: string | null },
): Promise<void> {
  const existing = await tx.campaign.findMany({
    where: { automationId: automation.id, workspaceId: automation.workspaceId },
    select: { id: true, automationStepId: true, recipientCount: true },
  });

  const wanted = new Set<string>();
  for (const { step, content } of emails) {
    const keys = new Set<string>();
    if (automation.trigger.type === "date_anniversary") {
      const year = options.now.getUTCFullYear();
      keys.add(`${step.id}:${year}`);
      keys.add(`${step.id}:${year + 1}`);
      // Earlier years that still have people on the way get the edit too.
      for (const c of existing) if (c.automationStepId && stepIdOfKey(c.automationStepId) === step.id && yearOfKey(c.automationStepId)) keys.add(c.automationStepId);
    } else {
      keys.add(step.id);
    }
    for (const key of keys) {
      wanted.add(key);
      await writeStepCampaign(tx, automation, step, key, content, options);
    }
  }

  for (const c of existing) {
    if (c.automationStepId && wanted.has(c.automationStepId)) continue;
    // A step that no longer exists (or a key from another trigger type).
    const used = c.recipientCount > 0 || (await tx.campaignRecipient.count({ where: { campaignId: c.id }, take: 1 })) > 0;
    if (!used) await tx.campaign.delete({ where: { id: c.id } });
  }
}

/**
 * Finds the hidden campaign for a step at run time. Birthday automations
 * create next years' campaigns lazily (rendered from the step, same checks as
 * activation). Returns null + a reason if the email can't be prepared.
 */
export async function ensureStepCampaign(
  automation: AutomationRef & { trigger: AutomationTrigger; createdById: string | null },
  step: SendEmailStep,
  key: string,
  now: Date,
): Promise<{ ok: true; campaignId: string; status: string } | { ok: false; error: string }> {
  const found = await db.campaign.findFirst({
    where: { automationId: automation.id, automationStepId: key, workspaceId: automation.workspaceId },
    select: { id: true, status: true },
  });
  if (found) return { ok: true, campaignId: found.id, status: found.status };
  if (key === step.id) {
    // Plain steps get their campaign at activation; missing = activation didn't finish.
    return { ok: false, error: `The email “${step.name}” isn't ready. Pause and re-activate the automation.` };
  }

  const rendered = await renderStepEmail(automation.workspaceId, step);
  if (!rendered.ok) return { ok: false, error: rendered.problems.join(" ") };
  try {
    const id = await db.$transaction((tx) => writeStepCampaign(tx, automation, step, key, rendered.content, { now, userId: automation.createdById }));
    return { ok: true, campaignId: id, status: "SENDING" };
  } catch (error) {
    // Two runs created this year's campaign at the same moment: the unique
    // (automationId, automationStepId) rule let one win. Use that one.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    const winner = await db.campaign.findFirst({
      where: { automationId: automation.id, automationStepId: key, workspaceId: automation.workspaceId },
      select: { id: true, status: true },
    });
    if (!winner) throw error;
    return { ok: true, campaignId: winner.id, status: winner.status };
  }
}

// ── Queueing one email ──────────────────────────────────────────────────────

export type QueueResult = "queued" | "already" | "not_eligible";

/**
 * Adds this contact to the step's campaign queue. ONE statement:
 *  - the contact must be in the campaign's workspace, SUBSCRIBED and not
 *    suppressed at this very moment (re-checked inside the INSERT);
 *  - ON CONFLICT DO NOTHING on the unique (campaignId, contactId) index:
 *    never two rows, so never two emails, even when a step is retried;
 *  - recipientCount is bumped only when a row was really added.
 * The worker then sends it (and re-checks status + suppression once more).
 */
export async function queueStepEmail(workspaceId: string, campaignId: string, contactId: string): Promise<QueueResult> {
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH ins AS (
      INSERT INTO campaign_recipient (id, "campaignId", "contactId", email)
      SELECT ${newRecipientId()}, ca.id, c.id, c.email
      FROM campaign ca
      JOIN contact c ON c.id = ${contactId}
      WHERE ca.id = ${campaignId} AND ca."workspaceId" = ${workspaceId} AND ca.kind = 'AUTOMATION'
        AND c."workspaceId" = ${workspaceId} AND c.status = 'SUBSCRIBED'::"ContactStatus"
        AND ${notSuppressedSql("c")}
      ON CONFLICT ("campaignId", "contactId") DO NOTHING
      RETURNING "campaignId"
    )
    UPDATE campaign SET "recipientCount" = campaign."recipientCount" + 1
    FROM ins WHERE campaign.id = ins."campaignId"
    RETURNING campaign.id`);
  if (rows.length > 0) return "queued";
  const existing = await db.campaignRecipient.findUnique({
    where: { campaignId_contactId: { campaignId, contactId } },
    select: { id: true },
  });
  return existing ? "already" : "not_eligible";
}

/** The recipient row of a contact for a step's email (for "did they open/click?"). */
export async function findStepRecipient(
  automationId: string,
  workspaceId: string,
  key: string,
  contactId: string,
): Promise<{ status: string; createdAt: Date; firstOpenedAt: Date | null; firstClickedAt: Date | null } | null> {
  const campaign = await db.campaign.findFirst({
    where: { automationId, automationStepId: key, workspaceId },
    select: { id: true },
  });
  if (!campaign) return null;
  return db.campaignRecipient.findUnique({
    where: { campaignId_contactId: { campaignId: campaign.id, contactId } },
    select: { status: true, createdAt: true, firstOpenedAt: true, firstClickedAt: true },
  });
}
