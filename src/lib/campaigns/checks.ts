import "server-only";
import type { CampaignStatus } from "@/generated/prisma/client";
import { audienceIsEmpty, readAudience } from "@/lib/campaigns/audience";
import { AudienceError, countAudience } from "@/lib/campaigns/resolve-audience";
import { db } from "@/lib/db";
import { documentWarnings, emailDocumentSchema, type EmailDocument } from "@/lib/templates/document";
import { TemplateError, compileTemplate, documentMergeTagErrors } from "@/lib/templates/personalize";
import { InvalidDocumentError, renderDocument } from "@/lib/templates/render";

// Pre-send checks ("preflight"). Run before every launch, and by the UI to
// show a checklist. PROBLEMS block sending; WARNINGS are shown but allowed.
//
// Each problem has a stable `code` (for the UI) and a plain-English message.
// `fix` links to the page where it can be fixed, when that's another page.

export type PreflightProblem = { code: string; message: string; fix?: { label: string; href: string } };

export type PreflightResult = {
  ok: boolean;
  problems: PreflightProblem[];
  warnings: string[];
  /** People who would get it right now (0 if the audience couldn't be worked out). */
  recipientCount: number;
};

/** What launch needs once the checks pass (so it doesn't have to load/render twice). */
export type PreflightReady = {
  /** The campaign's updatedAt when checked: launch only proceeds if nothing changed since. */
  updatedAt: Date;
  html: string;
  text: string;
  providerId: string;
  senderId: string;
};

export const SCHEDULE_MAX_DAYS = 365;

/** About how many emails a free Gmail account may send per day. */
const GMAIL_DAILY_LIMIT = 500;

const UNSUBSCRIBE_RE = /\{\{\s*unsubscribe_url\s*(\||\}\})/;

/** Pre-send checks for a campaign. Pass `scheduledAt` to also check the chosen time. */
export async function preflightCampaign(
  workspaceId: string,
  campaignId: string,
  userId: string,
  options: { scheduledAt?: Date | null } = {},
): Promise<PreflightResult> {
  return (await runPreflight(workspaceId, campaignId, userId, options)).result;
}

/** preflightCampaign plus the rendered email, for launchCampaign. */
export async function runPreflight(
  workspaceId: string,
  campaignId: string,
  userId: string,
  options: { scheduledAt?: Date | null } = {},
): Promise<{ result: PreflightResult; ready: PreflightReady | null }> {
  const problems: PreflightProblem[] = [];
  const warnings: string[] = [];
  const fail = (problem: PreflightProblem) => ({
    result: { ok: false, problems: [problem], warnings: [], recipientCount: 0 },
    ready: null,
  });

  const campaign =
    typeof campaignId === "string" && campaignId && campaignId.length <= 64
      ? await db.campaign.findFirst({
          where: { id: campaignId, workspaceId },
          select: {
            id: true,
            status: true,
            name: true,
            subject: true,
            preheader: true,
            senderId: true,
            audience: true,
            document: true,
            updatedAt: true,
          },
        })
      : null;
  if (!campaign) return fail({ code: "not_found", message: "This campaign doesn't exist (or was deleted)." });
  if (campaign.status !== "DRAFT") {
    return fail({ code: "not_draft", message: `This campaign is already ${statusWord(campaign.status)}, so it can't be launched again.` });
  }

  const audience = readAudience(campaign.audience);

  // Independent lookups in parallel.
  const [user, sender, audienceCount] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { emailVerified: true } }),
    campaign.senderId
      ? db.sender.findFirst({
          where: { id: campaign.senderId, workspaceId },
          select: { id: true, email: true, verifiedAt: true, providerId: true },
        })
      : null,
    audienceIsEmpty(audience)
      ? null
      : countAudience(workspaceId, audience).catch((error: unknown) => {
          if (error instanceof AudienceError) return error;
          throw error;
        }),
  ]);

  // ── Account ──
  if (!user?.emailVerified) {
    problems.push({
      code: "account_unverified",
      message: "Verify your account email before sending campaigns. We sent you a link when you signed up.",
      fix: { label: "Verify your email", href: "/verify-email" },
    });
  }

  // ── Sender and provider ──
  const sendersFix = { label: "Go to Senders", href: "/settings/senders" };
  if (!sender) {
    problems.push({ code: "no_sender", message: "Choose who the email comes from (a verified sender).", fix: sendersFix });
  } else if (!sender.verifiedAt) {
    problems.push({ code: "sender_unverified", message: `The sender ${sender.email} isn't verified yet.`, fix: sendersFix });
  }

  const provider = await resolveProvider(workspaceId, sender?.providerId ?? null);
  if (!provider) {
    problems.push({
      code: "no_provider",
      message: "There's no email provider to send through. Connect one and make it the default (or link it to the sender).",
      fix: { label: "Go to Providers", href: "/settings/providers" },
    });
  } else if (provider.status === "FAILED") {
    problems.push({
      code: "provider_failed",
      message: `The email provider “${provider.name}” isn't working${provider.lastError ? `: ${provider.lastError}` : ""}. Fix it and test it again.`,
      fix: { label: "Check the provider", href: `/settings/providers/${provider.id}` },
    });
  } else if (provider.status === "UNTESTED") {
    warnings.push(`The email provider “${provider.name}” hasn't been tested yet. Send yourself a test email first.`);
  }

  // ── Content ──
  if (!campaign.subject.trim()) problems.push({ code: "no_subject", message: "Add a subject line." });

  let rendered: { html: string; text: string } | null = null;
  const parsedDoc = campaign.document ? emailDocumentSchema.safeParse(campaign.document) : null;
  if (!parsedDoc) {
    problems.push({ code: "no_content", message: "Design the email first (pick a template or start from scratch)." });
  } else if (!parsedDoc.success) {
    problems.push({ code: "invalid_document", message: "The email design has a problem and can't be sent. Open it in the editor and save it again." });
  } else {
    rendered = await checkContent(parsedDoc.data, campaign, problems, warnings);
  }

  // ── Audience ──
  let recipientCount = 0;
  if (audienceIsEmpty(audience)) {
    problems.push({ code: "no_audience", message: "Choose at least one list or segment to send to." });
  } else if (audienceCount instanceof AudienceError) {
    for (const message of audienceCount.problems) {
      problems.push({ code: "audience_invalid", message, fix: { label: "Check your segments", href: "/contacts/segments" } });
    }
  } else if (audienceCount) {
    recipientCount = audienceCount.recipients;
    if (recipientCount === 0) {
      problems.push({
        code: "no_recipients",
        message: "Nobody would get this email: the chosen lists and segments have no subscribed contacts (after exclusions).",
      });
    }
  }

  // ── Schedule ──
  const at = options.scheduledAt;
  if (at !== undefined && at !== null) {
    if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
      problems.push({ code: "schedule_invalid", message: "Pick a valid date and time." });
    } else if (at.getTime() <= Date.now()) {
      problems.push({ code: "schedule_past", message: "That time has already passed. Pick a time in the future." });
    } else if (at.getTime() > Date.now() + SCHEDULE_MAX_DAYS * 86_400_000) {
      problems.push({ code: "schedule_too_far", message: "You can schedule up to a year ahead." });
    }
  }

  // ── Sending-speed warnings ──
  if (provider && recipientCount > 0) warnings.push(...(await volumeWarnings(provider, recipientCount)));

  const ok = problems.length === 0;
  return {
    result: { ok, problems, warnings: [...new Set(warnings)], recipientCount },
    ready:
      ok && rendered && provider && sender
        ? { updatedAt: campaign.updatedAt, html: rendered.html, text: rendered.text, providerId: provider.id, senderId: sender.id }
        : null,
  };
}

/** Content checks; returns the rendered email if it rendered. */
async function checkContent(
  doc: EmailDocument,
  campaign: { subject: string; preheader: string },
  problems: PreflightProblem[],
  warnings: string[],
): Promise<{ html: string; text: string } | null> {
  const before = problems.length;
  for (const message of documentMergeTagErrors(doc, { subject: campaign.subject, preheader: campaign.preheader })) {
    problems.push({ code: "merge_tag", message });
  }

  const blocks = doc.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));
  // Same rule as the editor's check (documentWarnings): the link must be in a block.
  const blockText = blocks.map((b) => ("html" in b ? b.html : "") + " " + ("href" in b ? b.href : "")).join(" ");
  if (!UNSUBSCRIBE_RE.test(blockText)) {
    problems.push({
      code: "no_unsubscribe",
      message: "Add an unsubscribe link (the Footer block has one). Every campaign must let people unsubscribe.",
    });
  }
  if (blocks.some((b) => b.type === "image" && !b.src.trim())) {
    problems.push({ code: "image_missing", message: "An image block has no picture yet. Add one or remove the block." });
  }
  // The editor's other checks (alt text, empty button links) are warnings only.
  for (const w of documentWarnings(doc)) {
    if (!/unsubscribe link|no picture/i.test(w)) warnings.push(w);
  }

  let rendered: { html: string; text: string };
  try {
    rendered = await renderDocument(doc, { subject: campaign.subject, preheader: campaign.preheader });
  } catch (error) {
    if (!(error instanceof InvalidDocumentError)) throw error;
    problems.push({ code: "invalid_document", message: error.message });
    return null;
  }

  // Parse the FINAL email once, exactly as the sender will. This catches any
  // merge tag problem the block-by-block check could miss, so the worker
  // never fails every recipient on the same broken tag.
  if (problems.length === before) {
    try {
      compileTemplate({ html: rendered.html, text: rendered.text, subject: campaign.subject });
    } catch (error) {
      if (!(error instanceof TemplateError)) throw error;
      problems.push({ code: "merge_tag", message: error.message });
    }
  }
  return rendered;
}

export type ResolvedProvider = {
  id: string;
  name: string;
  type: string;
  status: string;
  lastError: string | null;
  dailyLimit: number | null;
  credentialsHint: unknown;
};

/**
 * The provider a campaign would use: the sender's own provider, else the
 * workspace default. Both looked up WITHIN the workspace.
 */
export async function resolveProvider(workspaceId: string, preferredId: string | null): Promise<ResolvedProvider | null> {
  const select = { id: true, name: true, type: true, status: true, lastError: true, dailyLimit: true, credentialsHint: true } as const;
  if (preferredId) {
    const own = await db.sendingProvider.findFirst({ where: { id: preferredId, workspaceId }, select });
    if (own) return own;
  }
  return db.sendingProvider.findFirst({ where: { workspaceId, isDefault: true }, select, orderBy: { updatedAt: "desc" } });
}

/** "This will take about N days" style warnings. */
async function volumeWarnings(provider: ResolvedProvider, recipients: number): Promise<string[]> {
  const warnings: string[] = [];
  const fmt = (n: number) => n.toLocaleString("en-US");

  if (provider.dailyLimit && provider.dailyLimit > 0 && recipients > provider.dailyLimit) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const usage = await db.providerDailyUsage.findUnique({
      where: { providerId_day: { providerId: provider.id, day: today } },
      select: { sent: true },
    });
    const leftToday = Math.max(0, provider.dailyLimit - (usage?.sent ?? 0));
    const days = 1 + Math.ceil(Math.max(0, recipients - leftToday) / provider.dailyLimit);
    warnings.push(
      `${fmt(recipients)} recipients is more than your daily cap of ${fmt(provider.dailyLimit)} for “${provider.name}”, ` +
        `so this will take about ${days} days. Sending continues automatically each day (UTC).`,
    );
  }

  const host = hintHost(provider.credentialsHint);
  if (provider.type === "SMTP" && /(^|\.)(gmail|googlemail)\.com$/i.test(host) && recipients > GMAIL_DAILY_LIMIT) {
    warnings.push(
      `Gmail only allows about ${GMAIL_DAILY_LIMIT} emails a day (about 2,000 for Google Workspace). ` +
        `Sending ${fmt(recipients)} may get your account temporarily blocked. Set a daily cap on the provider, or use a service made for bulk email.`,
    );
  }
  return warnings;
}

/** "smtp.gmail.com:587" → "smtp.gmail.com" from the provider's safe hint. */
function hintHost(hint: unknown): string {
  if (!hint || typeof hint !== "object") return "";
  const host = (hint as Record<string, unknown>).host;
  return typeof host === "string" ? host.replace(/:\d+$/, "").trim() : "";
}

function statusWord(status: CampaignStatus): string {
  switch (status) {
    case "SCHEDULED": return "scheduled";
    case "SENDING": return "sending";
    case "PAUSED": return "paused";
    case "SENT": return "sent";
    case "CANCELLED": return "cancelled";
    case "FAILED": return "failed";
    default: return "launched";
  }
}
