import "server-only";
import { Prisma, type TransactionalStatus } from "@/generated/prisma/client";
import { resolveProvider } from "@/lib/campaigns/checks";
import { db } from "@/lib/db";
import { getVerifiedSenders, senderNameSchema } from "@/lib/email/senders";
import { buildContent, type ContentContact } from "./content";
import { cleanIdempotencyKey, requestHash, splitStoredKey, storedIdempotencyKey } from "./idempotency";
import { checkTransactionalSuppression } from "./policy";
import { PUBLIC_EMAIL_SELECT, toPublicEmail } from "./queries";
import type { ApiErrorCode, PublicEmail, SendEmailInput } from "./schema";

// ACCEPTING ONE TRANSACTIONAL EMAIL ("send this receipt to Anita").
//
// enqueueTransactional() checks the request, builds the final personalised
// email, and stores it as a TransactionalEmail row with status QUEUED. It does
// NOT talk to the provider: the background worker (worker.ts, run first in
// every tick of src/lib/campaigns/worker.ts) sends it, with retries. So an API
// call answers in milliseconds even if the provider is slow.
//
// EXPECTED LATENCY: the worker ticks about once a second and handles
// transactional email before campaigns, so a queued email normally leaves
// within ~1–2 seconds (plus the provider's speed limit if it is busy).
//
// The steps, in order (the first problem is returned as an error):
//   1. Idempotency-Key: a repeat of an earlier request returns that email
//      (duplicate: true); same key + different body → idempotency_conflict.
//      Design notes in idempotency.ts.
//   2. Sender: `from` must be a VERIFIED sender of this workspace (anti-spoofing).
//      A `from.name` replaces the sender's display name for this email.
//   3. Provider: the sender's own provider, else the workspace default (same
//      rule as campaigns). None, or marked FAILED → no_provider.
//   4. Content: template or html/text, personalised (content.ts).
//   5. Suppression (policy.ts): transactional email is NOT marketing, so
//      UNSUBSCRIBED people still get it. Hard bounces, spam complaints,
//      manual blocks and GDPR erasures are NOT sent: the email is stored
//      with status SUPPRESSED and a reason, and returned normally (202). The
//      caller learns it from `status`, not from an error.
//   6. Insert (status QUEUED, or SUPPRESSED).
//
// SAFETY: every lookup filters by the workspace (sender, provider, template,
// contact), so nothing from another workspace can ever be used.

export type EnqueueContext = {
  apiKeyId: string | null;
  idempotencyKey: string | null;
  source: "api" | "dashboard";
};

export type EnqueueResult =
  | { ok: true; email: PublicEmail; duplicate: boolean }
  | { ok: false; code: ApiErrorCode; message: string; details?: unknown };

const fail = (code: ApiErrorCode, message: string, details?: unknown): EnqueueResult =>
  details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };

export async function enqueueTransactional(
  ws: { id: string; name: string },
  input: SendEmailInput,
  ctx: EnqueueContext,
): Promise<EnqueueResult> {
  // ── 1. Idempotency (fast path, before any work) ──
  const key = cleanIdempotencyKey(ctx.idempotencyKey);
  if (key === "invalid") {
    return fail("invalid_request", "The Idempotency-Key must be 1–100 characters, without line breaks or control characters.");
  }
  const hash = requestHash(input);
  if (key) {
    const earlier = await findByIdempotencyKey(db, ws.id, key);
    if (earlier) return answerRepeat(earlier, hash);
  }

  const toEmail = input.to.email; // the schema already trimmed and lower-cased it

  // ── 2. Sender ──
  const senders = await getVerifiedSenders(ws.id);
  const sender = senders.find((s) => s.email.toLowerCase() === input.from.email);
  if (!sender) {
    const known = senders.slice(0, 5).map((s) => s.email);
    return fail(
      "sender_not_verified",
      `"${input.from.email}" isn't a verified sender of this workspace. Add it in Settings → Senders and enter the 6-digit code we email to that address.` +
        (known.length ? ` Verified senders: ${known.join(", ")}${senders.length > known.length ? ", ..." : ""}.` : " This workspace has no verified senders yet."),
      { field: "from" },
    );
  }
  let fromName = sender.name;
  if (input.from.name) {
    // Same rules as a sender's saved name: no hidden characters, and no
    // "PayPal <security@paypal.com>"-style names hiding the real address.
    const parsed = senderNameSchema.safeParse(input.from.name);
    if (!parsed.success) {
      return fail("invalid_request", `The "from" name isn't allowed: ${parsed.error.issues[0]?.message ?? "invalid name"}`, { field: "from.name" });
    }
    fromName = parsed.data;
  }

  // ── 3. Provider ──
  const provider = await resolveProvider(ws.id, sender.providerId);
  if (!provider) {
    return fail(
      "no_provider",
      "There's no email provider to send through. Connect one in Settings → Sending providers and make it the default (or link it to this sender).",
    );
  }
  if (provider.status === "FAILED") {
    return fail(
      "no_provider",
      `The email provider "${provider.name}" isn't working${provider.lastError ? `: ${provider.lastError}` : ""}. Fix it in Settings → Sending providers and test it again.`,
    );
  }

  // ── 4. Content (needs the contact for {{ contact.* }}) ──
  const contact = await db.contact.findUnique({
    where: { workspaceId_email: { workspaceId: ws.id, email: toEmail } },
    select: { id: true, email: true, firstName: true, lastName: true, attributes: true, status: true },
  });
  const mergeContact: ContentContact | null = contact
    ? { id: contact.id, email: contact.email, firstName: contact.firstName, lastName: contact.lastName, attributes: contact.attributes }
    : null;
  const content = await buildContent({ workspace: ws, input, toEmail, contact: mergeContact });
  if (!content.ok) return fail(content.code, content.message, content.details);

  // ── 5. Suppression ──
  const verdict = await checkTransactionalSuppression(ws.id, toEmail, contact?.status ?? null);
  const status: TransactionalStatus = verdict.blocked ? "SUPPRESSED" : "QUEUED";
  // An erased person's email is logged (so the caller can see what happened),
  // but its content isn't kept: we don't store new personal data about them.
  const keepContent = !(verdict.blocked && verdict.erased);

  // ── 6. Insert ──
  const contactName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ").replace(/[\r\n]+/g, " ").trim() : "";
  const data: Prisma.TransactionalEmailUncheckedCreateInput = {
    workspaceId: ws.id,
    apiKeyId: ctx.apiKeyId,
    source: ctx.source,
    idempotencyKey: key ? storedIdempotencyKey(key, hash) : null,
    toEmail,
    toName: input.to.name || contactName || null,
    contactId: contact?.id ?? null,
    senderId: sender.id,
    providerId: provider.id,
    templateId: input.templateId ?? null,
    fromEmail: sender.email.toLowerCase(),
    fromName,
    replyTo: input.replyTo?.email ?? sender.replyTo ?? null,
    subject: content.subject,
    html: keepContent ? content.html : "",
    text: keepContent ? content.text : "",
    tags: [...new Set(input.tags ?? [])],
    metadata: (input.metadata as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
    status,
    lastError: verdict.blocked ? verdict.reason : null,
  };

  if (!key) {
    const row = await db.transactionalEmail.create({ data, select: PUBLIC_EMAIL_SELECT });
    return { ok: true, email: toPublicEmail(row), duplicate: false };
  }
  return insertOnce(ws.id, key, hash, data);
}

// ── Idempotency helpers ──────────────────────────────────────────────────────

type Client = Prisma.TransactionClient | typeof db;
type KeyedRow = Prisma.TransactionalEmailGetPayload<{ select: typeof PUBLIC_EMAIL_SELECT & { idempotencyKey: true } }>;

/**
 * The email this workspace already accepted with this key, if any.
 *
 * Raw SQL on purpose: Prisma's `startsWith` does NOT escape % and _, so a key
 * like "50%_off" would match other keys. Here the key is escaped, and the
 * pattern is "<key>|" + exactly 16 characters (the hash), so only this exact
 * key can match. (Cost: it reads this workspace's entries of the
 * (workspaceId, idempotencyKey) index; fine for now, see the Phase 9 notes.)
 */
async function findByIdempotencyKey(client: Client, workspaceId: string, key: string): Promise<KeyedRow | null> {
  const pattern = storedIdempotencyKey(key.replace(/[\\%_]/g, (c) => `\\${c}`), "_".repeat(16));
  const ids = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM transactional_email
    WHERE "workspaceId" = ${workspaceId} AND "idempotencyKey" LIKE ${pattern} ESCAPE '\\'
    LIMIT 2`);
  if (ids.length === 0) return null;
  const row = await client.transactionalEmail.findFirst({
    where: { id: ids[0].id, workspaceId },
    select: { ...PUBLIC_EMAIL_SELECT, idempotencyKey: true },
  });
  // Double-check in JavaScript too: the user's part must be exactly this key.
  return row?.idempotencyKey && splitStoredKey(row.idempotencyKey)?.key === key ? row : null;
}

function answerRepeat(row: KeyedRow, hash: string): EnqueueResult {
  const stored = row.idempotencyKey ? splitStoredKey(row.idempotencyKey) : null;
  if (stored && stored.hash === hash) return { ok: true, email: toPublicEmail(row), duplicate: true };
  return fail(
    "idempotency_conflict",
    "This Idempotency-Key was already used for a different request. Use a new key for a new email, or send exactly the same body to get the first email back.",
    { emailId: row.id },
  );
}

/**
 * Inserts the row unless another request with the same key got there first.
 * The advisory lock makes concurrent requests with the same key wait for
 * each other (only those: different keys don't block each other).
 */
async function insertOnce(
  workspaceId: string,
  key: string,
  hash: string,
  data: Prisma.TransactionalEmailUncheckedCreateInput,
): Promise<EnqueueResult> {
  try {
    return await db.$transaction(async (tx) => {
      // Released automatically when the transaction ends.
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`klyve-tx-idem:${workspaceId}:${key}`}, 0))`);
      const earlier = await findByIdempotencyKey(tx, workspaceId, key);
      if (earlier) return answerRepeat(earlier, hash);
      const row = await tx.transactionalEmail.create({ data, select: PUBLIC_EMAIL_SELECT });
      return { ok: true, email: toPublicEmail(row), duplicate: false } as const;
    });
  } catch (err) {
    // Belt and braces: the unique constraint fired anyway → the row exists now.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const earlier = await findByIdempotencyKey(db, workspaceId, key);
      if (earlier) return answerRepeat(earlier, hash);
    }
    throw err;
  }
}
