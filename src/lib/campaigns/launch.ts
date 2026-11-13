import "server-only";
import { randomBytes } from "node:crypto";
import type { CampaignStatus } from "@/generated/prisma/client";
import { readAudience } from "@/lib/campaigns/audience";
import { resolveProvider, runPreflight, type PreflightProblem } from "@/lib/campaigns/checks";
import { NOT_FOUND, wsId, type WorkspaceArg } from "@/lib/campaigns/queries";
import { AudienceError, iterateAudienceContacts } from "@/lib/campaigns/resolve-audience";
import { emailSchema } from "@/lib/contacts/common";
import { db } from "@/lib/db";
import { getVerifiedSender } from "@/lib/email/senders";
import { sendWithStoredProvider } from "@/lib/email/stored-provider";
import { emailDocumentSchema } from "@/lib/templates/document";
import { TemplateError, buildMergeData, personalize } from "@/lib/templates/personalize";
import { findSuppression, notSuppressedSql } from "@/lib/suppression";
import { suppressedMessage } from "@/lib/suppression/meta";
import { InvalidDocumentError, renderDocument } from "@/lib/templates/render";
import { SAMPLE_CONTACT } from "@/lib/templates/sample-data";
import { prepareTrackedHtml, untrackHtml } from "@/lib/tracking/links";
import { applyUtmTags, getCampaignUtmTags } from "@/lib/tracking/utm-settings";

// Launching campaigns and moving them between states.
//
// RACE SAFETY: every status change is ONE conditional write, e.g.
//   UPDATE campaign SET status = 'SENDING' WHERE id = … AND status = 'DRAFT'
// The database runs these one at a time, so if Send is clicked twice (or the
// user and the background worker act at the same moment) exactly one write
// matches and the other changes nothing (count = 0). Nothing launches twice.
//
// THE STATE MACHINE (who may move a campaign where):
//   DRAFT ──launch──▶ SENDING            (send now: recipients created here)
//   DRAFT ──launch──▶ SCHEDULED ──worker at scheduledAt──▶ SENDING
//   SCHEDULED ──unschedule──▶ DRAFT
//   SENDING ──pause──▶ PAUSED ──resume──▶ SENDING
//   SCHEDULED / SENDING / PAUSED ──cancel──▶ CANCELLED
//   SENDING ──worker, all done──▶ SENT;   anything active ──error──▶ FAILED

export type StateResult = { ok: true } | { ok: false; error: string };
export type LaunchResult = { ok: true; status: "SCHEDULED" | "SENDING" } | { ok: false; problems: PreflightProblem[] };

/** States in which recipients may be (re)created. */
const MATERIALIZABLE: CampaignStatus[] = ["SCHEDULED", "SENDING", "PAUSED"];
/** Recipients created per database round trip. */
const MATERIALIZE_BATCH = 1000;

const NO_SUBSCRIBERS = "No subscribed contacts in this audience";

// ── Launch ──────────────────────────────────────────────────────────────────

/**
 * Sends a DRAFT now, or schedules it (`scheduledAt`). Runs every pre-send
 * check first; any problem → nothing changes and the problems come back.
 */
export async function launchCampaign(
  ws: WorkspaceArg,
  campaignId: string,
  userId: string,
  options: { scheduledAt?: Date | null } = {},
): Promise<LaunchResult> {
  const workspaceId = wsId(ws);
  const scheduledAt = options.scheduledAt ?? null;

  const { result, ready } = await runPreflight(workspaceId, campaignId, userId, { scheduledAt });
  if (!result.ok || !ready) return { ok: false, problems: result.problems };

  // Tracking: rewrite links / add the open pixel in the HTML we freeze.
  // `updatedAt` must match what preflight checked, so these switches belong
  // to the very version that was checked.
  const switches = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId },
    select: { name: true, trackOpens: true, trackClicks: true, updatedAt: true },
  });
  if (!switches || switches.updatedAt.getTime() !== ready.updatedAt.getTime()) {
    return { ok: false, problems: [{ code: "changed", message: "The campaign was changed while it was being checked. Please try again." }] };
  }
  // UTM tags (Settings → Link tracking) go in FIRST, so the links stored for
  // click tracking already carry them and the click redirect passes them on.
  const utmTags = await getCampaignUtmTags(workspaceId, switches.name);
  const tracked = prepareTrackedHtml(applyUtmTags(ready.html, utmTags), switches);

  const now = new Date();
  // ONE conditional write claims the launch. `updatedAt` must still be what
  // we checked: if the draft was edited in the meantime, we don't launch
  // content that was never checked. The tracked links are saved in the SAME
  // transaction, so a launched campaign never has links missing.
  const claimed = await db.$transaction(async (tx) => {
    const claim = await tx.campaign.updateMany({
      where: { id: campaignId, workspaceId, status: "DRAFT", updatedAt: ready.updatedAt },
      data: {
        status: scheduledAt ? "SCHEDULED" : "SENDING",
        html: tracked.html,
        text: ready.text, // the plain-text part keeps the real links (never tracked)
        providerId: ready.providerId, // frozen: the worker always uses this one
        scheduledAt,
        startedAt: scheduledAt ? null : now,
        finishedAt: null,
        lastError: null,
        recipientCount: 0,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
      },
    });
    if (claim.count === 1) {
      // Leftovers from an earlier launch that was unscheduled: start clean.
      await tx.campaignLink.deleteMany({ where: { campaignId } });
      if (tracked.links.length > 0) {
        await tx.campaignLink.createMany({ data: tracked.links.map((l) => ({ campaignId, position: l.position, url: l.url })) });
      }
    }
    return claim;
  });
  if (claimed.count === 0) {
    const current = await db.campaign.findFirst({ where: { id: campaignId, workspaceId }, select: { status: true } });
    if (!current) return { ok: false, problems: [{ code: "not_found", message: NOT_FOUND }] };
    if (current.status !== "DRAFT") {
      return { ok: false, problems: [{ code: "not_draft", message: "This campaign was already launched." }] };
    }
    return {
      ok: false,
      problems: [{ code: "changed", message: "The campaign was changed while it was being checked. Please try again." }],
    };
  }

  // Scheduled: recipients are created when it starts (by the worker), so
  // the audience is fresh at send time.
  if (scheduledAt) return { ok: true, status: "SCHEDULED" };

  try {
    const count = await materializeRecipients(campaignId);
    if (count === 0) {
      const after = await db.campaign.findFirst({ where: { id: campaignId, workspaceId }, select: { status: true, lastError: true } });
      if (after?.status === "FAILED") {
        return { ok: false, problems: [{ code: "no_recipients", message: after.lastError ?? NO_SUBSCRIBERS }] };
      }
    }
  } catch (error) {
    // The campaign is already SENDING with recipientCount 0. The worker
    // notices that and calls materializeRecipients again, so it's safe to
    // report success here rather than leave the user guessing.
    console.error("materializeRecipients failed during launch:", error);
  }
  return { ok: true, status: "SENDING" };
}

/**
 * Creates one CampaignRecipient row per final audience member (PENDING),
 * then sets recipientCount to the real number of rows. Returns that number.
 *
 * - Idempotent: the unique (campaignId, contactId) index + ON CONFLICT DO NOTHING
 *   means running it again (e.g. after a crash halfway) only adds what's
 *   missing; nobody gets two rows.
 * - Each batch is checked by iterateAudienceContacts (SUBSCRIBED, same
 *   workspace, not suppressed, exclusions) and SUBSCRIBED + workspace + not
 *   suppressed again in the INSERT itself.
 * - recipientCount stays 0 until it has finished: the worker can use
 *   "SENDING and recipientCount = 0" to mean "not materialized yet".
 * - 0 recipients → campaign FAILED ("No subscribed contacts in this audience").
 * - A list/segment that is gone or broken → campaign FAILED with the reason.
 * - Only works on SCHEDULED / SENDING / PAUSED campaigns; for any other
 *   status it changes nothing and returns the existing row count.
 */
export async function materializeRecipients(campaignId: string): Promise<number> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, workspaceId: true, status: true, audience: true },
  });
  if (!campaign) return 0;
  if (!MATERIALIZABLE.includes(campaign.status)) {
    return db.campaignRecipient.count({ where: { campaignId } });
  }

  try {
    for await (const batch of iterateAudienceContacts(campaign.workspaceId, readAudience(campaign.audience), MATERIALIZE_BATCH)) {
      // Stop early if the campaign was cancelled/unscheduled meanwhile.
      const current = await db.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
      if (!current || !MATERIALIZABLE.includes(current.status)) break;
      await insertRecipients(campaignId, campaign.workspaceId, batch.map((c) => c.id));
    }
  } catch (error) {
    if (error instanceof AudienceError) {
      await failCampaign(campaignId, `Couldn't work out who to send to: ${error.message}`);
      return 0;
    }
    throw error;
  }

  const total = await db.campaignRecipient.count({ where: { campaignId } });
  if (total === 0) {
    await failCampaign(campaignId, NO_SUBSCRIBERS);
    return 0;
  }
  await db.campaign.update({ where: { id: campaignId }, data: { recipientCount: total } });

  // Cancelled while we were adding rows? Then nothing new may be sent.
  const after = await db.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
  if (after?.status === "CANCELLED") await skipPending(campaignId, "Campaign cancelled");
  return total;
}

/** A random id like Prisma's cuids: lowercase letters/digits only (recipient tokens require that). */
function newRecipientId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return "r" + Array.from(randomBytes(24), (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Inserts PENDING recipient rows for these contacts. Same effect as
 * `createMany({ skipDuplicates: true })`, but one SQL statement that is
 * about 4x faster, and it RE-CHECKS each contact at the moment of writing:
 * only contacts that are still SUBSCRIBED, in this workspace and NOT on the
 * suppression list are inserted (with their current email). ON CONFLICT on
 * the unique (campaignId, contactId) index skips anyone who already has a
 * row, so it's idempotent.
 */
async function insertRecipients(campaignId: string, workspaceId: string, contactIds: string[]): Promise<number> {
  if (contactIds.length === 0) return 0;
  return db.$executeRaw`
    INSERT INTO campaign_recipient (id, "campaignId", "contactId", email)
    SELECT u.id, ${campaignId}, c.id, c.email
    FROM unnest(${contactIds.map(newRecipientId)}::text[], ${contactIds}::text[]) AS u(id, contact_id)
    JOIN contact c ON c.id = u.contact_id
    WHERE c."workspaceId" = ${workspaceId} AND c.status = 'SUBSCRIBED'::"ContactStatus"
      AND ${notSuppressedSql("c")}
    ON CONFLICT ("campaignId", "contactId") DO NOTHING
  `;
}

/** Marks an active campaign FAILED, and its unsent recipients SKIPPED. */
async function failCampaign(campaignId: string, reason: string): Promise<void> {
  const result = await db.campaign.updateMany({
    where: { id: campaignId, status: { in: MATERIALIZABLE } },
    data: { status: "FAILED", lastError: reason, finishedAt: new Date() },
  });
  if (result.count > 0) await skipPending(campaignId, reason);
}

/** PENDING recipients → SKIPPED (with a reason), keeping skippedCount in step. */
async function skipPending(campaignId: string, reason: string): Promise<number> {
  return db.$transaction(async (tx) => {
    const skipped = await tx.campaignRecipient.updateMany({
      where: { campaignId, status: "PENDING" },
      data: { status: "SKIPPED", lastError: reason },
    });
    if (skipped.count > 0) {
      await tx.campaign.update({ where: { id: campaignId }, data: { skippedCount: { increment: skipped.count } } });
    }
    return skipped.count;
  });
}

// ── State changes ───────────────────────────────────────────────────────────

/** Turns a failed conditional write into a clear message. */
async function explain(workspaceId: string, campaignId: string, action: string): Promise<StateResult> {
  const row = await db.campaign.findFirst({ where: { id: campaignId, workspaceId }, select: { status: true } });
  if (!row) return { ok: false, error: NOT_FOUND };
  return { ok: false, error: `This campaign can't be ${action} right now (it is ${row.status.toLowerCase()}).` };
}

/** SENDING → PAUSED. The worker stops picking up its recipients. */
export async function pauseCampaign(ws: WorkspaceArg, campaignId: string): Promise<StateResult> {
  const workspaceId = wsId(ws);
  // Automation emails are paused/resumed through their automation, never here.
  const r = await db.campaign.updateMany({ where: { id: campaignId, workspaceId, kind: "REGULAR", status: "SENDING" }, data: { status: "PAUSED" } });
  return r.count === 1 ? { ok: true } : explain(workspaceId, campaignId, "paused");
}

/**
 * PAUSED → SENDING, only if the sender is still verified and the provider
 * works (it may have been paused BECAUSE the provider failed). Clears lastError.
 */
export async function resumeCampaign(ws: WorkspaceArg, campaignId: string): Promise<StateResult> {
  const workspaceId = wsId(ws);
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId },
    select: { status: true, senderId: true, providerId: true },
  });
  if (!campaign) return { ok: false, error: NOT_FOUND };
  if (campaign.status !== "PAUSED") return explain(workspaceId, campaignId, "resumed");

  const sender = campaign.senderId
    ? await db.sender.findFirst({ where: { id: campaign.senderId, workspaceId }, select: { verifiedAt: true, providerId: true } })
    : null;
  if (!sender) return { ok: false, error: "The sender of this campaign was deleted. Duplicate the campaign and pick a sender." };
  if (!sender.verifiedAt) return { ok: false, error: "The sender of this campaign isn't verified any more. Verify it in Settings → Senders." };

  // Keep the provider chosen at launch; only if it was deleted, pick again.
  const frozen = campaign.providerId ? await resolveProvider(workspaceId, campaign.providerId) : null;
  const provider = frozen && frozen.id === campaign.providerId ? frozen : await resolveProvider(workspaceId, sender.providerId);
  if (!provider) return { ok: false, error: "There's no email provider to send through. Connect one in Settings → Providers." };
  if (provider.status === "FAILED") {
    return {
      ok: false,
      error: `The email provider “${provider.name}” isn't working${provider.lastError ? ` (${provider.lastError})` : ""}. Fix it and test it in Settings → Providers, then resume.`,
    };
  }

  const r = await db.campaign.updateMany({
    where: { id: campaignId, workspaceId, kind: "REGULAR", status: "PAUSED" },
    data: { status: "SENDING", lastError: null, providerId: provider.id },
  });
  return r.count === 1 ? { ok: true } : explain(workspaceId, campaignId, "resumed");
}

/** SCHEDULED / SENDING / PAUSED → CANCELLED. Unsent recipients become SKIPPED. */
export async function cancelCampaign(ws: WorkspaceArg, campaignId: string): Promise<StateResult> {
  const workspaceId = wsId(ws);
  const r = await db.campaign.updateMany({
    where: { id: campaignId, workspaceId, kind: "REGULAR", status: { in: ["SCHEDULED", "SENDING", "PAUSED"] } },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
  if (r.count !== 1) return explain(workspaceId, campaignId, "cancelled");
  // Emails already handed to the worker (status SENDING) finish normally;
  // everything still waiting is skipped.
  await skipPending(campaignId, "Campaign cancelled");
  return { ok: true };
}

/** SCHEDULED → DRAFT, so it can be edited again (it's re-checked on the next launch). */
export async function unscheduleCampaign(ws: WorkspaceArg, campaignId: string): Promise<StateResult> {
  const workspaceId = wsId(ws);
  const r = await db.campaign.updateMany({
    where: { id: campaignId, workspaceId, status: "SCHEDULED" },
    data: { status: "DRAFT", scheduledAt: null, providerId: null, html: "", text: "", lastError: null },
  });
  if (r.count !== 1) return explain(workspaceId, campaignId, "unscheduled");
  // A scheduled campaign has no recipients yet, but clear any just in case.
  await db.campaignRecipient.deleteMany({ where: { campaignId, status: "PENDING" } });
  // Its tracked links are re-made from the (possibly edited) design at the next launch.
  await db.campaignLink.deleteMany({ where: { campaignId } });
  return { ok: true };
}

// ── Test email ──────────────────────────────────────────────────────────────

const TEST_LIMIT = { perHour: 20, windowMs: 60 * 60 * 1000 } as const;

// Same in-memory limiter as template test emails (src/app/actions/templates.ts),
// and the SAME bucket on globalThis: 20 test emails per user per hour in
// total, whether sent from a template or a campaign. Resets on server restart;
// several servers would each count separately.
const testSendLog: Map<string, number[]> = ((globalThis as { __klyveTestSends?: Map<string, number[]> }).__klyveTestSends ??=
  new Map());

function takeTestSendSlot(userId: string): { ok: true } | { ok: false; retryInMinutes: number } {
  const now = Date.now();
  const recent = (testSendLog.get(userId) ?? []).filter((t) => now - t < TEST_LIMIT.windowMs);
  if (recent.length >= TEST_LIMIT.perHour) {
    testSendLog.set(userId, recent);
    return { ok: false, retryInMinutes: Math.max(1, Math.ceil((recent[0] + TEST_LIMIT.windowMs - now) / 60_000)) };
  }
  recent.push(now);
  testSendLog.set(userId, recent);
  return { ok: true };
}

/** Placeholder unsubscribe link in test emails (there's no real recipient to unsubscribe). */
const TEST_UNSUBSCRIBE_URL = "#unsubscribe-link-(test)";

/**
 * Sends the campaign as it is now to one address, as a test ("[Test] " subject).
 * Personalized as the contact with that email if they're in this workspace,
 * else as a sample contact. Uses the campaign's sender and provider.
 */
export async function sendCampaignTest(
  ws: WorkspaceArg,
  userId: string,
  campaignId: string,
  input: { to: string },
): Promise<{ ok: boolean; message: string }> {
  const workspaceId = wsId(ws);
  const to = emailSchema.safeParse(input.to);
  if (!to.success) return { ok: false, message: to.error.issues[0]?.message ?? "Please enter a valid email address." };
  // Even a test may not go to an address this workspace must never email.
  const suppression = await findSuppression(workspaceId, to.data);
  if (suppression) return { ok: false, message: suppressedMessage(suppression.reason) };

  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId },
    select: { name: true, status: true, subject: true, preheader: true, document: true, html: true, text: true, senderId: true, providerId: true },
  });
  if (!campaign) return { ok: false, message: NOT_FOUND };

  const sender = campaign.senderId ? await getVerifiedSender(workspaceId, campaign.senderId) : null;
  if (!sender) return { ok: false, message: "Pick a verified sender for this campaign first." };
  // The provider frozen at launch if there is one, else the sender's, else the default.
  const frozen = campaign.providerId
    ? await db.sendingProvider.findFirst({ where: { id: campaign.providerId, workspaceId }, select: { id: true } })
    : null;
  const provider = frozen ?? (await resolveProvider(workspaceId, sender.providerId));
  if (!provider) return { ok: false, message: "There's no email provider to send through. Connect one in Settings → Providers." };

  // A launched campaign is tested exactly as rendered at launch; a draft is
  // rendered fresh from its current design.
  let parts: { html: string; text: string };
  if (campaign.status !== "DRAFT" && campaign.html) {
    // Without tracking: there's no real recipient to count, so the test gets
    // the original links back and no open pixel.
    const links = await db.campaignLink.findMany({ where: { campaignId }, select: { position: true, url: true } });
    parts = { html: untrackHtml(campaign.html, links), text: campaign.text };
  } else {
    const doc = campaign.document ? emailDocumentSchema.safeParse(campaign.document) : null;
    if (!doc?.success) return { ok: false, message: "Design the email first, then send a test." };
    try {
      parts = await renderDocument(doc.data, { subject: campaign.subject, preheader: campaign.preheader });
      // Same UTM tags as the real send, so the test shows the links people will get.
      parts = { ...parts, html: applyUtmTags(parts.html, await getCampaignUtmTags(workspaceId, campaign.name)) };
    } catch (error) {
      if (error instanceof InvalidDocumentError) return { ok: false, message: error.message };
      throw error;
    }
  }

  // Counted only once the request is valid, so typos don't use up the limit.
  const slot = takeTestSendSlot(userId);
  if (!slot.ok) {
    return {
      ok: false,
      message: `You've sent ${TEST_LIMIT.perHour} test emails in the last hour. Try again in ${slot.retryInMinutes} min.`,
    };
  }

  const contact = await db.contact.findUnique({
    where: { workspaceId_email: { workspaceId, email: to.data } },
    select: { email: true, firstName: true, lastName: true, attributes: true },
  });
  const workspaceName = typeof ws === "string" ? "" : (ws.name ?? "");
  const data = buildMergeData(contact ?? SAMPLE_CONTACT, { unsubscribeUrl: TEST_UNSUBSCRIBE_URL, workspaceName });
  let filled;
  try {
    filled = personalize({ ...parts, subject: campaign.subject || campaign.name }, data);
  } catch (error) {
    if (error instanceof TemplateError) return { ok: false, message: error.message };
    throw error;
  }

  const result = await sendWithStoredProvider(workspaceId, provider.id, {
    from: { email: sender.email, name: sender.name },
    to: { email: to.data },
    replyTo: sender.replyTo ?? undefined,
    subject: `[Test] ${filled.subject}`.slice(0, 250),
    html: filled.html,
    text: filled.text,
    tags: { kind: "campaign-test" },
  });
  if (!result.ok) return { ok: false, message: `The email provider said: ${result.error}` };
  return { ok: true, message: `Test email sent to ${to.data}.` };
}
