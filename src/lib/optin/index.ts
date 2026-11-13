import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { absoluteUrl } from "@/lib/app-url";
import { getBrandKit, getBrandTheme } from "@/lib/brand-kit";
import { createRecipientToken, verifyRecipientToken } from "@/lib/campaigns/tokens";
import { recordConsent } from "@/lib/consent";
import { emailSchema, type AttributeValue } from "@/lib/contacts/common";
import { db } from "@/lib/db";
import { getVerifiedSender, type VerifiedSender } from "@/lib/email/senders";
import { sendWithStoredProvider } from "@/lib/email/stored-provider";
import { isSuppressed } from "@/lib/suppression";
import {
  OPTIN_LIMITS,
  defaultOptInMessage,
  defaultOptInSubject,
  renderOptInEmail,
  type OptInEmailBrand,
} from "./email";

// Double opt-in ("confirmed opt-in").
//
// When a workspace turns it on, people who sign up through a form or the API
// (Phase 7) are saved as PENDING and get a confirmation email. Only after
// they click "Yes, subscribe me" do they become SUBSCRIBED and receive
// campaigns. This proves the address belongs to the person who signed up
// (nobody can sign up someone else) and gives a strong consent record.
//
// The confirmation link is /c/<token>, where the token is the CONTACT id
// signed with a server secret (tokens.ts, purpose "confirm"). The token is the
// same every time for a contact, so it can't expire by itself. Instead:
//
//   A confirmation link works for 30 days after the LATEST confirmation email
//   (contact.optInSentAt). Resending the email restarts the 30 days.
//
// Opening the link (GET) only shows a button; the POST from that button
// confirms. Mail scanners open links automatically and must never confirm.

type WorkspaceRef = string | { id: string; name?: string };
const wsId = (ws: WorkspaceRef) => (typeof ws === "string" ? ws : ws.id);

/** How long a confirmation link works after the latest confirmation email. */
export const CONFIRM_LINK_DAYS = 30;
const CONFIRM_LINK_MS = CONFIRM_LINK_DAYS * 24 * 60 * 60 * 1000;

/** Anti-abuse limits for confirmation emails, per contact. */
export const OPTIN_RATE_LIMITS = { minGapMinutes: 10, maxPerDay: 3 } as const;
const MIN_GAP_MS = OPTIN_RATE_LIMITS.minGapMinutes * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Settings ────────────────────────────────────────────────────────────────

export type OptInSettings = {
  enabled: boolean;
  senderId: string | null;
  /** The subject/message actually used (our default wording when not customised). */
  subject: string;
  message: string;
  /** False while the default wording is used. */
  customized: { subject: boolean; message: boolean };
  /** The chosen sender, only if it still exists AND is verified. */
  sender: VerifiedSender | null;
};

/** The workspace's double opt-in settings, with defaults filled in. */
export async function getOptInSettings(ws: WorkspaceRef): Promise<OptInSettings> {
  const id = wsId(ws);
  const row = await db.workspace.findUnique({
    where: { id },
    select: { name: true, doubleOptIn: true, optInSenderId: true, optInSubject: true, optInMessage: true },
  });
  if (!row) throw new Error("Workspace not found.");
  const theme = await getBrandTheme({ id, name: row.name });
  const sender = row.optInSenderId ? await getVerifiedSender(id, row.optInSenderId) : null;
  return {
    enabled: row.doubleOptIn,
    senderId: row.optInSenderId,
    subject: row.optInSubject || defaultOptInSubject(theme.companyName),
    message: row.optInMessage || defaultOptInMessage(theme.companyName),
    customized: { subject: !!row.optInSubject, message: !!row.optInMessage },
    sender,
  };
}

/**
 * The brand bits the confirmation email and /c page show. The postal address
 * is the one actually saved (not the "Your street" placeholder).
 */
export async function getOptInBrand(ws: { id: string; name: string }): Promise<OptInEmailBrand> {
  const [theme, kit] = await Promise.all([getBrandTheme(ws), getBrandKit(ws)]);
  // Logos uploaded to our media library are stored as "/media/…": an email
  // needs the full address.
  const logo = theme.logoUrl?.startsWith("/") ? absoluteUrl(theme.logoUrl) : theme.logoUrl;
  return { companyName: theme.companyName, logoUrl: logo, primaryColor: theme.primaryColor, address: kit.address.trim() };
}

// ── Sending the confirmation email ──────────────────────────────────────────

export type SendOptInResult = { ok: true } | { ok: false; error: string };

/** Builds From/To/subject/body for one confirmation email. */
async function buildEmail(workspace: { id: string; name: string }, sender: VerifiedSender, settings: OptInSettings, to: { email: string; name?: string }, confirmUrl: string) {
  const brand = await getOptInBrand(workspace);
  const content = renderOptInEmail({ subject: settings.subject, message: settings.message, confirmUrl, brand });
  return {
    from: { email: sender.email, name: sender.name },
    to,
    ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
    subject: content.subject,
    html: content.html,
    text: content.text,
    tags: { purpose: "double-opt-in" },
  };
}

/** The sender's own provider, or the workspace default (same rule as campaigns). */
async function providerFor(workspaceId: string, sender: VerifiedSender): Promise<string | null> {
  if (sender.providerId) {
    const own = await db.sendingProvider.findFirst({ where: { id: sender.providerId, workspaceId }, select: { id: true } });
    if (own) return own.id;
  }
  const fallback = await db.sendingProvider.findFirst({
    where: { workspaceId, isDefault: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  return fallback?.id ?? null;
}

const NO_SENDER =
  "Choose a verified sender for confirmation emails in Settings → Compliance first.";

/**
 * Sends (or re-sends) the confirmation email to a PENDING contact.
 *
 * Limits, so nobody can use it to flood an inbox: at most one email per
 * contact every 10 minutes and 3 per 24 hours. Never sent to suppressed
 * addresses. Records CONFIRMATION_SENT and sets optInSentAt on success.
 */
export async function sendOptInEmail(
  ws: WorkspaceRef,
  contactId: string,
  opts: { source?: string; ip?: string | null; userAgent?: string | null; userId?: string | null } = {},
): Promise<SendOptInResult> {
  const workspaceId = wsId(ws);
  const contact = await db.contact.findFirst({
    where: { id: contactId, workspaceId },
    select: { id: true, email: true, firstName: true, lastName: true, status: true, optInSentAt: true },
  });
  if (!contact) return { ok: false, error: "Contact not found." };
  if (contact.status !== "PENDING") {
    return { ok: false, error: "Only contacts awaiting confirmation can be sent a confirmation email." };
  }
  if (await isSuppressed(workspaceId, contact.email)) {
    return { ok: false, error: "This address is on your suppression list, so it can't be emailed." };
  }

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true } });
  if (!workspace) return { ok: false, error: "Workspace not found." };
  const settings = await getOptInSettings(workspace);
  if (!settings.sender) return { ok: false, error: NO_SENDER };
  const providerId = await providerFor(workspaceId, settings.sender);
  if (!providerId) return { ok: false, error: "Connect a sending provider in Settings → Sending providers first." };

  // ── Rate limits ──
  const now = new Date();
  if (contact.optInSentAt && now.getTime() - contact.optInSentAt.getTime() < MIN_GAP_MS) {
    const minutes = Math.ceil((MIN_GAP_MS - (now.getTime() - contact.optInSentAt.getTime())) / 60_000);
    return { ok: false, error: `A confirmation email was sent recently. Try again in ${minutes} min.` };
  }
  const sentToday = await db.consentEvent.count({
    where: { workspaceId, contactId, type: "CONFIRMATION_SENT", createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
  });
  if (sentToday >= OPTIN_RATE_LIMITS.maxPerDay) {
    return { ok: false, error: `This contact already got ${OPTIN_RATE_LIMITS.maxPerDay} confirmation emails today. Try again tomorrow.` };
  }

  // Claim the slot BEFORE sending, with the old value in the WHERE: if two
  // requests arrive at the same moment, only one can win, so the person
  // never gets two emails.
  const claimed = await db.contact.updateMany({
    where: { id: contact.id, workspaceId, status: "PENDING", optInSentAt: contact.optInSentAt },
    data: { optInSentAt: now },
  });
  if (claimed.count === 0) return { ok: false, error: "A confirmation email was sent just now." };

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").replace(/[\r\n"<>]/g, "").slice(0, 100);
  const confirmUrl = absoluteUrl(`/c/${createRecipientToken(contact.id, "confirm")}`);
  const email = await buildEmail(workspace, settings.sender, settings, { email: contact.email, ...(name ? { name } : {}) }, confirmUrl);

  const result = await sendWithStoredProvider(workspaceId, providerId, email);
  if (!result.ok) {
    // Give the slot back so they can try again once the problem is fixed.
    await db.contact.updateMany({
      where: { id: contact.id, workspaceId, optInSentAt: now },
      data: { optInSentAt: contact.optInSentAt },
    });
    return { ok: false, error: `The confirmation email couldn't be sent: ${result.error}` };
  }

  await recordConsent({
    workspaceId,
    contactId: contact.id,
    email: contact.email,
    type: "CONFIRMATION_SENT",
    source: opts.source ?? "manual",
    ip: opts.ip,
    userAgent: opts.userAgent,
    userId: opts.userId,
    detail: { sender: settings.sender.email },
  });
  return { ok: true };
}

/**
 * Sends a sample confirmation email (Settings → "Send me a test") to the
 * logged-in user. No contact is created and the link inside goes to a demo
 * page that changes nothing. Values are the (maybe unsaved) form values.
 */
export async function sendOptInTestEmail(
  ws: { id: string; name: string },
  input: { to: string; senderId: string; subject: string; message: string },
): Promise<SendOptInResult> {
  const sender = await getVerifiedSender(ws.id, input.senderId);
  if (!sender) return { ok: false, error: "Choose a verified sender first." };
  const providerId = await providerFor(ws.id, sender);
  if (!providerId) return { ok: false, error: "Connect a sending provider in Settings → Sending providers first." };

  const brand = await getOptInBrand(ws);
  const settings: OptInSettings = {
    enabled: true,
    senderId: sender.id,
    subject: input.subject.trim() || defaultOptInSubject(brand.companyName),
    message: input.message.trim() || defaultOptInMessage(brand.companyName),
    customized: { subject: true, message: true },
    sender,
  };
  const email = await buildEmail(ws, sender, settings, { email: input.to }, absoluteUrl("/c/test"));
  const result = await sendWithStoredProvider(ws.id, providerId, { ...email, subject: `[Test] ${email.subject}` });
  return result.ok ? { ok: true } : { ok: false, error: `The test email couldn't be sent: ${result.error}` };
}

// ── Confirming (the public /c/<token> page) ─────────────────────────────────

/** "priya@gmail.com" → "p•••@gmail.com". Enough to recognise, not to harvest. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

const linkAlive = (sentAt: Date | null) => !!sentAt && Date.now() - sentAt.getTime() <= CONFIRM_LINK_MS;

/** The contact a confirm token points at (with its workspace), or null. */
async function loadByToken(token: string) {
  const contactId = verifyRecipientToken(token, "confirm");
  if (!contactId) return null;
  return db.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      workspaceId: true,
      email: true,
      status: true,
      optInSentAt: true,
      confirmedAt: true,
      workspace: { select: { id: true, name: true } },
    },
  });
}

export type ConfirmContext =
  | {
      ok: true;
      /** "pending" = show the confirm button; "confirmed" = already subscribed. */
      state: "pending" | "confirmed";
      email: string;
      brand: { name: string; logoUrl: string | null; primaryColor: string };
    }
  | { ok: false };

/**
 * What the /c/<token> page shows. Never changes anything (GET-safe).
 * `{ ok: false }` for forged, expired, unsubscribed, bounced or suppressed,
 * without saying which (no hints for someone probing links).
 */
export async function getConfirmContext(token: string): Promise<ConfirmContext> {
  const contact = await loadByToken(token);
  if (!contact) return { ok: false };

  let state: "pending" | "confirmed";
  if (contact.status === "SUBSCRIBED") state = contact.confirmedAt || !linkAlive(contact.optInSentAt) ? "confirmed" : "pending";
  else if (contact.status === "PENDING" && linkAlive(contact.optInSentAt)) state = "pending";
  else return { ok: false };

  if (state === "pending" && (await isSuppressed(contact.workspaceId, contact.email))) return { ok: false };

  const theme = await getBrandTheme(contact.workspace);
  return {
    ok: true,
    state,
    email: maskEmail(contact.email),
    brand: { name: theme.companyName, logoUrl: theme.logoUrl, primaryColor: theme.primaryColor },
  };
}

export type ConfirmResult =
  | { ok: true; alreadyConfirmed: boolean; workspaceName: string; email: string }
  | { ok: false };

/**
 * Confirms the subscription a /c token belongs to: PENDING → SUBSCRIBED,
 * stamps confirmedAt and records CONFIRMED. Safe to call twice (the second
 * call reports alreadyConfirmed). Refuses forged or expired links, and
 * contacts that are suppressed, UNSUBSCRIBED, BOUNCED or COMPLAINED.
 *
 * A contact a team member already marked as subscribed can still click: we
 * then just stamp confirmedAt (better proof), without changing the status.
 */
export async function confirmByToken(
  token: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ConfirmResult> {
  const contact = await loadByToken(token);
  if (!contact) return { ok: false };
  const theme = await getBrandTheme(contact.workspace);
  const done = (alreadyConfirmed: boolean): ConfirmResult => ({
    ok: true,
    alreadyConfirmed,
    workspaceName: theme.companyName,
    email: maskEmail(contact.email),
  });

  if (contact.status === "SUBSCRIBED" && (contact.confirmedAt || !linkAlive(contact.optInSentAt))) return done(true);
  if (contact.status !== "PENDING" && contact.status !== "SUBSCRIBED") return { ok: false };
  if (!linkAlive(contact.optInSentAt)) return { ok: false };
  if (await isSuppressed(contact.workspaceId, contact.email)) return { ok: false };

  const now = new Date();
  // Conditional update: only from the status we just read. If a bounce or an
  // unsubscribe landed in between, or a second click won the race, nothing
  // changes here.
  const changed = await db.contact.updateMany({
    where:
      contact.status === "PENDING"
        ? { id: contact.id, workspaceId: contact.workspaceId, status: "PENDING" }
        : { id: contact.id, workspaceId: contact.workspaceId, status: "SUBSCRIBED", confirmedAt: null },
    data: { status: "SUBSCRIBED", confirmedAt: now },
  });
  if (changed.count === 0) {
    const fresh = await db.contact.findUnique({ where: { id: contact.id }, select: { status: true } });
    return fresh?.status === "SUBSCRIBED" ? done(true) : { ok: false };
  }

  await recordConsent({
    workspaceId: contact.workspaceId,
    contactId: contact.id,
    email: contact.email,
    type: "CONFIRMED",
    source: "confirmation_link",
    ip: meta.ip,
    userAgent: meta.userAgent,
    detail: contact.status === "SUBSCRIBED" ? { note: "Was already marked as subscribed by the team." } : undefined,
  });
  return done(false);
}

// ── Adding people who signed up (forms / API, Phase 7) ──────────────────────

export type AddPendingInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Custom attribute values, already validated by the caller. */
  attributes?: Record<string, AttributeValue>;
  listIds?: string[];
  /** "form", "api", ... */
  source: string;
  ip?: string | null;
  userAgent?: string | null;
};

export type AddPendingResult = {
  /** null only when the address is suppressed and no contact existed. */
  contactId: string | null;
  created: boolean;
  /** True when a confirmation email went out. */
  sent: boolean;
  /** True when the address is on the suppression list (nothing was added). */
  suppressed?: boolean;
};

const clip = (v: string | null | undefined, max: number) => {
  const t = v?.replace(/\s+/g, " ").trim().slice(0, max);
  return t ? t : null;
};

/**
 * Adds someone who signed up themselves (a form, the API).
 *
 *  - Double opt-in ON  → new contacts are PENDING and get the confirmation email.
 *  - Double opt-in OFF → new contacts are SUBSCRIBED straight away.
 *  - An existing SUBSCRIBED contact is never downgraded.
 *  - An UNSUBSCRIBED, BOUNCED or COMPLAINED contact is never resubscribed
 *    (created:false, sent:false): they said no, or the address doesn't work.
 *  - A suppressed address is not added at all.
 *  - The lists are joined in every case where a contact exists.
 *
 * Throws only for an invalid email address (callers validate first).
 */
export async function addPendingContact(ws: WorkspaceRef, input: AddPendingInput): Promise<AddPendingResult> {
  const workspaceId = wsId(ws);
  const email = emailSchema.parse(input.email);
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { doubleOptIn: true } });
  if (!workspace) throw new Error("Workspace not found.");

  // Only lists of THIS workspace, whatever ids the caller passed.
  const listIds = input.listIds?.length
    ? (await db.contactList.findMany({ where: { workspaceId, id: { in: input.listIds } }, select: { id: true } })).map((l) => l.id)
    : [];
  const meta = { ip: input.ip, userAgent: input.userAgent };
  const firstName = clip(input.firstName, 100);
  const lastName = clip(input.lastName, 100);

  let existing = await db.contact.findUnique({
    where: { workspaceId_email: { workspaceId, email } },
    select: { id: true, status: true, firstName: true, lastName: true, attributes: true },
  });

  if (!existing) {
    if (await isSuppressed(workspaceId, email)) return { contactId: null, created: false, sent: false, suppressed: true };
    const status = workspace.doubleOptIn ? "PENDING" : "SUBSCRIBED";
    try {
      const contact = await db.contact.create({
        data: {
          workspaceId,
          email,
          firstName,
          lastName,
          status,
          source: input.source.slice(0, 50),
          attributes: (input.attributes ?? {}) as Prisma.InputJsonValue,
          lists: listIds.length ? { create: listIds.map((listId) => ({ listId })) } : undefined,
        },
        select: { id: true },
      });
      // The sign-up itself is part of the proof: when, from where, which lists.
      await recordConsent({
        workspaceId,
        contactId: contact.id,
        email,
        type: "SUBSCRIBED",
        source: input.source,
        ...meta,
        detail: { lists: listIds, doubleOptIn: workspace.doubleOptIn, ...(status === "PENDING" ? { awaitingConfirmation: true } : {}) },
      });
      if (status === "SUBSCRIBED") return { contactId: contact.id, created: true, sent: false };
      const sent = await sendOptInEmail(workspaceId, contact.id, { source: input.source, ...meta });
      if (!sent.ok) console.warn(`[optin] confirmation email not sent for a new contact in ${workspaceId}: ${sent.error}`);
      return { contactId: contact.id, created: true, sent: sent.ok };
    } catch (error) {
      // Two sign-ups with the same address at the same moment: the database's
      // unique rule lets one win; the other continues as "existing".
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      existing = await db.contact.findUnique({
        where: { workspaceId_email: { workspaceId, email } },
        select: { id: true, status: true, firstName: true, lastName: true, attributes: true },
      });
      if (!existing) throw error;
    }
  }

  // ── An existing contact ──
  // Fill in blanks only: a sign-up form never overwrites what the team saved.
  const oldAttributes = (existing.attributes && typeof existing.attributes === "object" && !Array.isArray(existing.attributes)
    ? existing.attributes
    : {}) as Record<string, unknown>;
  const newAttributes = Object.fromEntries(
    Object.entries(input.attributes ?? {}).filter(([key, value]) => oldAttributes[key] == null && value != null),
  );
  const patch: Prisma.ContactUpdateManyMutationInput = {};
  if (!existing.firstName && firstName) patch.firstName = firstName;
  if (!existing.lastName && lastName) patch.lastName = lastName;
  if (Object.keys(newAttributes).length) patch.attributes = { ...oldAttributes, ...newAttributes } as Prisma.InputJsonValue;
  if (Object.keys(patch).length) await db.contact.updateMany({ where: { id: existing.id, workspaceId }, data: patch });
  if (listIds.length) {
    await db.listMembership.createMany({
      data: listIds.map((listId) => ({ listId, contactId: existing.id })),
      skipDuplicates: true,
    });
  }

  if (existing.status !== "PENDING") return { contactId: existing.id, created: false, sent: false };

  // Still waiting for confirmation and signing up again.
  if (await isSuppressed(workspaceId, email)) return { contactId: existing.id, created: false, sent: false, suppressed: true };
  if (!workspace.doubleOptIn) {
    // Double opt-in was switched off since: this new sign-up is enough.
    const changed = await db.contact.updateMany({ where: { id: existing.id, workspaceId, status: "PENDING" }, data: { status: "SUBSCRIBED" } });
    if (changed.count) {
      await recordConsent({ workspaceId, contactId: existing.id, email, type: "SUBSCRIBED", source: input.source, ...meta, detail: { lists: listIds, doubleOptIn: false } });
    }
    return { contactId: existing.id, created: false, sent: false };
  }
  // Re-send the confirmation email (the rate limits stop floods).
  const sent = await sendOptInEmail(workspaceId, existing.id, { source: input.source, ...meta });
  return { contactId: existing.id, created: false, sent: sent.ok };
}

// ── The contact page (dashboard) ────────────────────────────────────────────

/** When the next confirmation email may be sent to this contact (null = now). */
export async function nextOptInSendAt(workspaceId: string, contactId: string, optInSentAt: Date | null): Promise<Date | null> {
  const now = Date.now();
  let next = optInSentAt && now - optInSentAt.getTime() < MIN_GAP_MS ? optInSentAt.getTime() + MIN_GAP_MS : 0;
  const recent = await db.consentEvent.findMany({
    where: { workspaceId, contactId, type: "CONFIRMATION_SENT", createdAt: { gte: new Date(now - DAY_MS) } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (recent.length >= OPTIN_RATE_LIMITS.maxPerDay) {
    // The oldest of the last 3 has to fall out of the 24-hour window first.
    next = Math.max(next, recent[recent.length - OPTIN_RATE_LIMITS.maxPerDay].createdAt.getTime() + DAY_MS);
  }
  return next > now ? new Date(next) : null;
}

/**
 * A team member confirms a PENDING contact by hand (they must have their own
 * proof of consent). PENDING → SUBSCRIBED and a STATUS_CHANGED record naming
 * who did it. confirmedAt stays empty: it means "the person clicked".
 */
export async function markContactConfirmed(
  workspaceId: string,
  contactId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const contact = await db.contact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true, email: true, status: true } });
  if (!contact) return { ok: false, error: "Contact not found." };
  if (contact.status !== "PENDING") return { ok: false, error: "This contact isn't awaiting confirmation any more. Reload the page." };
  if (await isSuppressed(workspaceId, contact.email)) {
    return { ok: false, error: "This address is on your suppression list. Remove it there first if you're sure." };
  }
  const changed = await db.contact.updateMany({ where: { id: contact.id, workspaceId, status: "PENDING" }, data: { status: "SUBSCRIBED" } });
  if (changed.count === 0) return { ok: false, error: "This contact changed in the meantime. Reload and try again." };
  await recordConsent({
    workspaceId,
    contactId: contact.id,
    email: contact.email,
    type: "STATUS_CHANGED",
    source: "manual",
    userId,
    detail: { from: "PENDING", to: "SUBSCRIBED", reason: "Marked as confirmed by a team member" },
  });
  return { ok: true };
}

export { OPTIN_LIMITS };
