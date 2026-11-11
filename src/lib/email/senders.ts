import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { BRAND } from "@/lib/brand";
import { emailSchema } from "@/lib/contacts/common";
import { safeEqualHex, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { sendWithStoredProvider } from "@/lib/email/stored-provider";
import type { OutgoingEmail } from "@/lib/email/types";

// Senders = the "From" addresses a workspace may use for campaigns.
//
// ANTI-SPOOFING: anyone can TYPE any address, so a new sender starts as
// "pending". It only becomes usable after someone enters the 6-digit code we
// emailed TO that address, which proves they can read its inbox.
//
// Every function takes a workspaceId and filters by it. ONLY pass the id from
// requireActiveWorkspace(): ids coming from the browser are never trusted alone.

export const SENDER_RULES = {
  /** A code stops working after this long. */
  codeTtlMinutes: 15,
  /** Wrong guesses allowed per code; after that a new code is needed. */
  maxAttempts: 5,
  /** Minimum wait between two codes for the same sender. */
  resendCooldownSeconds: 60,
  /** Codes per address per 24 hours (survives deleting and re-adding the sender). */
  maxCodesPerAddressPerDay: 10,
  /** Codes per workspace per 24 hours, so nobody can spray codes at many addresses. */
  maxCodesPerWorkspacePerDay: 50,
  maxSendersPerWorkspace: 50,
} as const;

// ── Validation ──────────────────────────────────────────────────────────────

// Control characters (incl. CR/LF, which could inject extra email headers),
// Unicode line breaks, and right-to-left / invisible tricks used to disguise names.
const UNSAFE_RANGES: [number, number][] = [
  [0x00, 0x1f], // control characters, including CR (0x0d) and LF (0x0a)
  [0x7f, 0x7f], // DEL
  [0x85, 0x85], // "next line"
  [0x200b, 0x200f], // zero-width characters and direction marks
  [0x2028, 0x2029], // Unicode line / paragraph separators
  [0x202a, 0x202e], // right-to-left overrides (can make text read backwards)
  [0x2066, 0x2069], // more direction controls
  [0xfeff, 0xfeff], // invisible "byte order mark"
];

function hasUnsafeChars(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (UNSAFE_RANGES.some(([from, to]) => code >= from && code <= to)) return true;
  }
  return false;
}

const noLineBreaks = (value: string) => !/[\r\n]/.test(value);

export const senderNameSchema = z
  .string()
  .refine((v) => !hasUnsafeChars(v), "The name can't contain line breaks or hidden characters.")
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Enter a display name, like “Acme News”.")
      .max(70, "Keep the name to 70 characters or fewer.")
      // "PayPal <security@paypal.com>" as a display name is a classic phishing
      // trick (the real address hides behind it), so names can't look like addresses.
      .refine((v) => !/[<>]/.test(v) && !/\S@\S+\.\S/.test(v), "The name can't contain an email address or < >."),
  );

const senderEmailSchema = z
  .string()
  .refine(noLineBreaks, "The email can't contain line breaks.")
  .pipe(emailSchema);

const replyToSchema = z
  .string()
  .refine(noLineBreaks, "The reply-to address can't contain line breaks.")
  .transform((v) => v.trim())
  .pipe(z.union([z.literal(""), emailSchema]))
  .transform((v) => v || null);

const idSchema = z.string().trim().min(1).max(64);

const createSchema = z.object({
  email: senderEmailSchema,
  name: senderNameSchema,
  replyTo: replyToSchema,
  providerId: idSchema,
});

// The email is deliberately NOT editable: the verification proved THAT address.
// To use another address, delete the sender and add a new one.
const updateSchema = createSchema.omit({ email: true });

export type SenderFieldErrors = Partial<Record<"email" | "name" | "replyTo" | "providerId", string[]>>;

export type SenderInput = { email?: unknown; name?: unknown; replyTo?: unknown; providerId?: unknown };

const str = (v: unknown) => (typeof v === "string" ? v : "");

// ── Reading ─────────────────────────────────────────────────────────────────

export type SenderSummary = {
  id: string;
  email: string;
  name: string;
  replyTo: string | null;
  provider: { id: string; name: string; type: string } | null;
  verifiedAt: Date | null;
  verificationSentAt: Date | null;
  /** true while a code was sent, hasn't expired and still has attempts left. */
  codeActive: boolean;
  createdAt: Date;
};

/** All senders of a workspace (never includes the code hash). */
export async function listSenders(workspaceId: string): Promise<SenderSummary[]> {
  const rows = await db.sender.findMany({
    where: { workspaceId },
    orderBy: [{ verifiedAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      replyTo: true,
      verifiedAt: true,
      verificationSentAt: true,
      verificationExpiresAt: true,
      verificationAttempts: true,
      verificationCodeHash: true,
      createdAt: true,
      provider: { select: { id: true, name: true, type: true } },
    },
  });
  const now = Date.now();
  return rows.map(({ verificationCodeHash, verificationExpiresAt, verificationAttempts, ...row }) => ({
    ...row,
    codeActive:
      !!verificationCodeHash &&
      !!verificationExpiresAt &&
      verificationExpiresAt.getTime() > now &&
      verificationAttempts < SENDER_RULES.maxAttempts,
  }));
}

export type VerifiedSender = {
  id: string;
  email: string;
  name: string;
  replyTo: string | null;
  providerId: string | null;
};

/** Senders that passed verification: the ONLY ones campaigns may use. */
export async function getVerifiedSenders(workspaceId: string): Promise<VerifiedSender[]> {
  return db.sender.findMany({
    where: { workspaceId, verifiedAt: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, replyTo: true, providerId: true },
  });
}

/** One verified sender, or null (use when a campaign is about to send). */
export async function getVerifiedSender(workspaceId: string, senderId: string): Promise<VerifiedSender | null> {
  return db.sender.findFirst({
    where: { id: senderId, workspaceId, verifiedAt: { not: null } },
    select: { id: true, email: true, name: true, replyTo: true, providerId: true },
  });
}

export type ProviderChoice = { id: string; name: string; type: string; isDefault: boolean; status: string };

/** The workspace's providers, for the "send through" dropdown (no credentials). */
export async function listProviderChoices(workspaceId: string): Promise<ProviderChoice[]> {
  return db.sendingProvider.findMany({
    where: { workspaceId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, type: true, isDefault: true, status: true },
  });
}

/** true only if this provider exists IN THIS workspace. */
async function providerBelongsTo(workspaceId: string, providerId: string): Promise<boolean> {
  const found = await db.sendingProvider.findFirst({ where: { id: providerId, workspaceId }, select: { id: true } });
  return !!found;
}

// ── Creating, editing, deleting ─────────────────────────────────────────────

export type SendCodeResult =
  | { ok: true; sentTo: string }
  | { ok: false; error: string; /** The provider's own error text, if it refused to send. */ providerError?: string; retryAfterSeconds?: number };

export type CreateSenderResult =
  | { ok: true; sender: { id: string; email: string }; send: SendCodeResult }
  | { ok: false; error?: string; fieldErrors?: SenderFieldErrors };

/** Adds a pending sender and immediately emails it a verification code. */
export async function createSender(workspaceId: string, input: SenderInput): Promise<CreateSenderResult> {
  const parsed = createSchema.safeParse({
    email: str(input.email),
    name: str(input.name),
    replyTo: str(input.replyTo),
    providerId: str(input.providerId),
  });
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const data = parsed.data;

  if (!(await providerBelongsTo(workspaceId, data.providerId))) {
    return { ok: false, fieldErrors: { providerId: ["Choose one of your sending providers."] } };
  }
  const count = await db.sender.count({ where: { workspaceId } });
  if (count >= SENDER_RULES.maxSendersPerWorkspace) {
    return { ok: false, error: `A workspace can have up to ${SENDER_RULES.maxSendersPerWorkspace} senders. Delete one you no longer use.` };
  }

  let sender: { id: string; email: string };
  try {
    sender = await db.sender.create({
      data: { workspaceId, ...data },
      select: { id: true, email: true },
    });
  } catch (error) {
    // The unique rule on (workspaceId, email) catches duplicates, even two at once.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, fieldErrors: { email: ["This address is already one of your senders."] } };
    }
    throw error;
  }

  const send = await sendVerificationCode(workspaceId, sender.id);
  return { ok: true, sender, send };
}

export type SimpleResult = { ok: true } | { ok: false; error?: string; fieldErrors?: SenderFieldErrors };

/** Changes the display name, reply-to and provider. The email never changes. */
export async function updateSender(workspaceId: string, senderId: string, input: SenderInput): Promise<SimpleResult> {
  const id = idSchema.safeParse(senderId);
  if (!id.success) return { ok: false, error: "Sender not found." };
  const parsed = updateSchema.safeParse({
    name: str(input.name),
    replyTo: str(input.replyTo),
    providerId: str(input.providerId),
  });
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };

  if (!(await providerBelongsTo(workspaceId, parsed.data.providerId))) {
    return { ok: false, fieldErrors: { providerId: ["Choose one of your sending providers."] } };
  }
  const result = await db.sender.updateMany({ where: { id: id.data, workspaceId }, data: parsed.data });
  return result.count ? { ok: true } : { ok: false, error: "Sender not found." };
}

export async function deleteSender(workspaceId: string, senderId: string): Promise<SimpleResult> {
  const id = idSchema.safeParse(senderId);
  if (!id.success) return { ok: false, error: "Sender not found." };
  // Note: we keep the "codes sent today" counter, so deleting and re-adding
  // an address doesn't reset its daily limit.
  const result = await db.sender.deleteMany({ where: { id: id.data, workspaceId } });
  return result.count ? { ok: true } : { ok: false, error: "Sender not found." };
}

// ── Verification codes ──────────────────────────────────────────────────────

// The daily limits need a counter that our Sender table doesn't have. Instead of
// changing the schema we add one short-lived row per code sent to the existing
// `verification` table (the one Better Auth uses for its tokens). Our rows use
// their own "mailflow:sender-code:" prefix so they can never clash with Better
// Auth's, hold no secrets (value is just "sent") and expire after 24 hours.
const COUNTER_PREFIX = "mailflow:sender-code:";
const counterKey = (workspaceId: string, email: string) => `${COUNTER_PREFIX}${workspaceId}:${email}`;
const DAY_MS = 24 * 60 * 60 * 1000;

/** We store only this hash. Mixing in the sender id ties a code to ONE sender. */
function hashCode(senderId: string, code: string): string {
  return sha256(`sender-verification:${senderId}:${code}`);
}

/**
 * Creates a new code and emails it to the sender address, sent FROM that same
 * address through the sender's provider. That's a realistic test: if the
 * provider isn't allowed to send as this address, the user finds out now.
 */
export async function sendVerificationCode(workspaceId: string, senderId: string): Promise<SendCodeResult> {
  const id = idSchema.safeParse(senderId);
  if (!id.success) return { ok: false, error: "Sender not found." };

  const sender = await db.sender.findFirst({
    where: { id: id.data, workspaceId },
    select: { id: true, email: true, name: true, providerId: true, verifiedAt: true, verificationSentAt: true },
  });
  if (!sender) return { ok: false, error: "Sender not found." };
  if (sender.verifiedAt) return { ok: false, error: "This sender is already verified." };
  if (!sender.providerId) {
    return { ok: false, error: "This sender has no sending provider (it may have been deleted). Edit the sender and choose one." };
  }

  const now = new Date();
  const cooldownMs = SENDER_RULES.resendCooldownSeconds * 1000;
  if (sender.verificationSentAt && now.getTime() - sender.verificationSentAt.getTime() < cooldownMs) {
    const wait = Math.ceil((sender.verificationSentAt.getTime() + cooldownMs - now.getTime()) / 1000);
    return { ok: false, error: `Please wait ${wait} seconds before asking for another code.`, retryAfterSeconds: wait };
  }

  // Daily limits (rolling 24 hours).
  const since = new Date(now.getTime() - DAY_MS);
  await db.verification.deleteMany({
    where: { identifier: { startsWith: `${COUNTER_PREFIX}${workspaceId}:` }, expiresAt: { lt: now } },
  });
  const [forAddress, forWorkspace] = await Promise.all([
    db.verification.count({ where: { identifier: counterKey(workspaceId, sender.email), createdAt: { gte: since } } }),
    db.verification.count({
      where: { identifier: { startsWith: `${COUNTER_PREFIX}${workspaceId}:` }, createdAt: { gte: since } },
    }),
  ]);
  if (forAddress >= SENDER_RULES.maxCodesPerAddressPerDay) {
    return {
      ok: false,
      error: `We've already sent ${SENDER_RULES.maxCodesPerAddressPerDay} codes to this address today. Please try again tomorrow.`,
    };
  }
  if (forWorkspace >= SENDER_RULES.maxCodesPerWorkspacePerDay) {
    return { ok: false, error: "This workspace has reached today's limit for verification emails. Please try again tomorrow." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = hashCode(sender.id, code);

  // Claim the send in ONE conditional update. If two clicks arrive at the same
  // moment, only one matches the "cooldown is over" condition.
  const claimed = await db.sender.updateMany({
    where: {
      id: sender.id,
      workspaceId,
      verifiedAt: null,
      OR: [{ verificationSentAt: null }, { verificationSentAt: { lte: new Date(now.getTime() - cooldownMs) } }],
    },
    data: {
      verificationCodeHash: codeHash,
      verificationExpiresAt: new Date(now.getTime() + SENDER_RULES.codeTtlMinutes * 60 * 1000),
      verificationAttempts: 0,
      verificationSentAt: now,
    },
  });
  if (claimed.count === 0) {
    return {
      ok: false,
      error: "A code was just sent. Please wait a minute before asking again.",
      retryAfterSeconds: SENDER_RULES.resendCooldownSeconds,
    };
  }
  const counter = await db.verification.create({
    data: { id: randomUUID(), identifier: counterKey(workspaceId, sender.email), value: "sent", expiresAt: new Date(now.getTime() + DAY_MS) },
    select: { id: true },
  });

  let result: Awaited<ReturnType<typeof sendWithStoredProvider>>;
  try {
    result = await sendWithStoredProvider(workspaceId, sender.providerId, verificationEmail(sender, code));
  } catch (error) {
    console.error("sendVerificationCode: provider threw", error);
    result = { ok: false, error: "The provider could not be reached.", retryable: true };
  }

  if (!result.ok) {
    // Nothing was delivered, so the code is useless: remove it, and don't count
    // it against the daily limit. (The 60-second wait still applies.)
    await Promise.all([
      db.sender.updateMany({
        where: { id: sender.id, workspaceId, verificationCodeHash: codeHash },
        data: { verificationCodeHash: null, verificationExpiresAt: null },
      }),
      db.verification.deleteMany({ where: { id: counter.id } }),
    ]);
    return {
      ok: false,
      error: "Your sending provider couldn't send the verification email.",
      providerError: result.error,
    };
  }
  return { ok: true, sentTo: sender.email };
}

export type VerifyResult = { ok: true } | { ok: false; error: string; attemptsLeft?: number; needsNewCode?: boolean };

/** Checks a code. 5 wrong tries or 15 minutes, and the user needs a new code. */
export async function verifySenderCode(workspaceId: string, senderId: string, rawCode: unknown): Promise<VerifyResult> {
  const id = idSchema.safeParse(senderId);
  if (!id.success) return { ok: false, error: "Sender not found." };

  // Accept "123 456" or "123-456"; anything else isn't worth an attempt.
  const code = typeof rawCode === "string" ? rawCode.replace(/[\s-]/g, "") : "";
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "Enter the 6-digit code from the email." };

  const now = new Date();
  // Spend one attempt FIRST, atomically, and only if the code is still usable.
  // Doing it before comparing means parallel guesses can't sneak past the limit.
  const spent = await db.sender.updateMany({
    where: {
      id: id.data,
      workspaceId,
      verifiedAt: null,
      verificationCodeHash: { not: null },
      verificationExpiresAt: { gt: now },
      verificationAttempts: { lt: SENDER_RULES.maxAttempts },
    },
    data: { verificationAttempts: { increment: 1 } },
  });

  const sender = await db.sender.findFirst({
    where: { id: id.data, workspaceId },
    select: { verifiedAt: true, verificationCodeHash: true, verificationExpiresAt: true, verificationAttempts: true },
  });
  if (!sender) return { ok: false, error: "Sender not found." };

  if (spent.count === 0) {
    // Explain why the code can't be used.
    if (sender.verifiedAt) return { ok: true };
    if (!sender.verificationCodeHash) {
      return { ok: false, error: "There's no active code for this sender. Send a new code.", needsNewCode: true };
    }
    if (!sender.verificationExpiresAt || sender.verificationExpiresAt <= now) {
      return { ok: false, error: "This code has expired. Send a new code.", needsNewCode: true };
    }
    return { ok: false, error: "Too many wrong attempts. Send a new code.", needsNewCode: true };
  }

  if (sender.verificationCodeHash && safeEqualHex(hashCode(id.data, code), sender.verificationCodeHash)) {
    const done = await db.sender.updateMany({
      // Only if the code wasn't replaced by a newer one in the meantime.
      where: { id: id.data, workspaceId, verificationCodeHash: sender.verificationCodeHash },
      data: { verifiedAt: now, verificationCodeHash: null, verificationExpiresAt: null, verificationAttempts: 0 },
    });
    if (done.count) return { ok: true };
  }

  const attemptsLeft = Math.max(0, SENDER_RULES.maxAttempts - sender.verificationAttempts);
  if (attemptsLeft === 0) {
    // Out of tries: throw the code away so only a brand-new one can work.
    await db.sender.updateMany({
      where: { id: id.data, workspaceId, verificationCodeHash: sender.verificationCodeHash },
      data: { verificationCodeHash: null, verificationExpiresAt: null },
    });
    return { ok: false, error: "That code is wrong, and you're out of attempts. Send a new code.", attemptsLeft, needsNewCode: true };
  }
  return {
    ok: false,
    error: `That code is wrong. ${attemptsLeft} ${attemptsLeft === 1 ? "attempt" : "attempts"} left.`,
    attemptsLeft,
  };
}

// ── The verification email ──────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function verificationEmail(sender: { email: string; name: string }, code: string): OutgoingEmail {
  const app = BRAND.name;
  const minutes = SENDER_RULES.codeTtlMinutes;
  const email = escapeHtml(sender.email);
  return {
    // From AND to the sender address itself (see sendVerificationCode).
    from: { email: sender.email, name: sender.name },
    to: { email: sender.email },
    subject: `Your ${app} verification code: ${code}`,
    text: [
      `Your ${app} verification code is: ${code}`,
      "",
      `Someone added ${sender.email} as a sender address in ${app}. Enter this code there (Settings → Senders) to confirm it's yours. The code expires in ${minutes} minutes.`,
      "",
      "If you didn't request this, ignore it. Nobody can send from this address in " + app + " without the code.",
    ].join("\n"),
    html: `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<p style="margin:0 0 8px;font-size:14px;color:#059669;font-weight:bold">${escapeHtml(app)}</p>
<h1 style="margin:0 0 16px;font-size:20px">Confirm your sender address</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">Someone added <strong>${email}</strong> as a sender address in ${escapeHtml(app)}. Enter this code there to confirm it's yours:</p>
<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:6px;font-family:'Courier New',monospace">${code}</p>
<p style="margin:0 0 16px;font-size:14px;color:#52525b">The code expires in ${minutes} minutes.</p>
<p style="margin:0;font-size:13px;color:#71717a">If you didn't request this, ignore it. Nobody can send from this address in ${escapeHtml(app)} without the code.</p>
</td></tr></table>
</td></tr></table>
</body></html>`,
    tags: { purpose: "sender-verification" },
  };
}
