import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type SuppressionReason } from "@/generated/prisma/client";
import { emailSchema, normalizeEmail } from "@/lib/contacts/common";
import { db } from "@/lib/db";
import {
  ERASURE_KEY_PATTERN,
  SUPPRESSION_NOTE_MAX,
  SUPPRESSION_REASON_META,
  type SuppressionReasonValue,
} from "@/lib/suppression/meta";

// THE SUPPRESSION LIST: addresses a workspace must NEVER email, whether or
// not they are (still) a contact. Emailing someone who asked us not to is a
// legal problem, so this is checked everywhere an email could go out:
//
//   - building a campaign's audience (live count + recipient rows), using the
//     set-based SQL fragment notSuppressedSql() below,
//   - once more right before each email is sent (send-one.ts),
//   - CSV import, "Add contact", "Add to list → create missing contacts", and
//     re-subscribing a contact by hand.
//
// HOW ADDRESSES ARE STORED
//   - Normally the lower-cased address ("priya@example.com").
//   - ERASURE rows (GDPR "forget me") store "sha256:<hex>" instead, so we can
//     still recognise the person if they're re-imported, without keeping their
//     address. So every lookup checks BOTH the address and its hash.
//
// WHAT IS ADDED AUTOMATICALLY
//   - Hard bounce → HARD_BOUNCE, spam complaint → COMPLAINT (tracking/record.ts).
//   - Unsubscribes are NOT added here: the contact's UNSUBSCRIBED status
//     already stops campaigns, and the person must be able to re-subscribe
//     later (preference centre, sign-up form) without the workspace having
//     to find and delete a suppression row first.
//
// Every function takes a `workspaceId`. ONLY pass the id from
// requireActiveWorkspace() (or one read from our own database rows), never an
// id from the browser. Every query filters by it, which keeps workspaces apart.

/** Prisma client or a transaction, so callers can include us in their transaction. */
type Client = Prisma.TransactionClient | typeof db;

/** Addresses per database round trip (each needs 2 parameters: address + hash). */
const LOOKUP_BATCH = 5_000;

/** "sha256:" + hex(sha256(normalizeEmail(email))): the key stored for ERASURE rows. */
export function suppressionKeyForErasure(email: string): string {
  return "sha256:" + createHash("sha256").update(normalizeEmail(email), "utf8").digest("hex");
}

/** True for a stored "sha256:<hex>" key (an erased person). */
export function isErasureKey(key: string): boolean {
  return ERASURE_KEY_PATTERN.test(key);
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ─── Lookups ────────────────────────────────────────────────────────────────

/**
 * Which of these emails are suppressed in this workspace? Returns the
 * NORMALIZED emails (trimmed, lower-cased) that are, checking both the plain
 * address and its erasure hash. Input may be messy ("  Priya@X.com ").
 */
export async function findSuppressed(
  workspaceId: string,
  emails: string[],
  opts: { client?: Client } = {},
): Promise<Set<string>> {
  const client = opts.client ?? db;
  const normalized = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  const found = new Set<string>();

  for (const batch of chunks(normalized, LOOKUP_BATCH)) {
    const hashOf = new Map(batch.map((e) => [e, suppressionKeyForErasure(e)]));
    const rows = await client.suppression.findMany({
      where: { workspaceId, email: { in: [...batch, ...hashOf.values()] } },
      select: { email: true },
    });
    const stored = new Set(rows.map((r) => r.email));
    for (const email of batch) {
      if (stored.has(email) || stored.has(hashOf.get(email)!)) found.add(email);
    }
  }
  return found;
}

/** One indexed lookup: is this address suppressed in this workspace? */
export async function isSuppressed(workspaceId: string, email: string, opts: { client?: Client } = {}): Promise<boolean> {
  return (await findSuppression(workspaceId, email, opts)) !== null;
}

/**
 * The suppression row for this address (plain or erasure hash), or null.
 * Used to tell the user WHY an address is blocked.
 */
export async function findSuppression(
  workspaceId: string,
  email: string,
  opts: { client?: Client } = {},
): Promise<{ id: string; reason: SuppressionReason } | null> {
  const plain = normalizeEmail(email);
  if (!plain) return null;
  const client = opts.client ?? db;
  const rows = await client.suppression.findMany({
    where: { workspaceId, email: { in: [plain, suppressionKeyForErasure(plain)] } },
    select: { id: true, reason: true },
  });
  // If both exist, report the erasure (it can't be removed, so it's the real answer).
  return rows.find((r) => r.reason === "ERASURE") ?? rows[0] ?? null;
}

/**
 * Splits emails into the ones that may be added and the ones that are
 * suppressed. Handy for "add these addresses" features (e.g. lists).
 */
export async function filterSuppressed(
  workspaceId: string,
  emails: string[],
  opts: { client?: Client } = {},
): Promise<{ allowed: string[]; suppressed: string[] }> {
  const blocked = await findSuppressed(workspaceId, emails, opts);
  const allowed: string[] = [];
  const suppressed: string[] = [];
  for (const email of new Set(emails.map(normalizeEmail).filter(Boolean))) {
    (blocked.has(email) ? suppressed : allowed).push(email);
  }
  return { allowed, suppressed };
}

/**
 * SQL for "this contact's address is NOT suppressed", for set-based queries
 * (audiences, recipient rows). `alias` is the contact table's alias in the
 * surrounding query. Checks the plain address and its erasure hash; the
 * unique (workspaceId, email) index makes it one index lookup per contact.
 *
 * convert_to(…, 'UTF8') rather than `::bytea`: a ::bytea cast treats
 * backslashes as escapes and would hash a different string than Node does.
 */
export function notSuppressedSql(alias = "c"): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error("Invalid table alias.");
  const c = Prisma.raw(alias); // checked above: a plain identifier, never user input
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM suppression s
    WHERE s."workspaceId" = ${c}."workspaceId"
      AND s.email IN (${c}.email, 'sha256:' || encode(sha256(convert_to(${c}.email, 'UTF8')), 'hex'))
  )`;
}

// ─── Adding ─────────────────────────────────────────────────────────────────

export type SuppressionEntry = { email: string; reason: SuppressionReason; note?: string | null };
export type AddSuppressionsResult = { added: number; alreadyThere: number; invalid: string[] };

/** Keeps a note short and on one line. Empty → null. */
function cleanNote(note: string | null | undefined): string | null {
  if (typeof note !== "string") return null;
  const text = note.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, SUPPRESSION_NOTE_MAX);
  return text || null;
}

/**
 * Adds addresses to the workspace's suppression list. Idempotent: an address
 * that's already there is left as it was (its first reason wins) and counted
 * in `alreadyThere`. Invalid addresses are returned in `invalid`.
 *
 * ERASURE entries are stored hashed. Because the point of an erasure is not
 * to keep the address, adding one also DELETES any plain row for the same
 * address, and a plain address whose hash is already stored is not stored
 * again (counted as alreadyThere). An ERASURE entry may also be given as an
 * existing "sha256:<hex>" key.
 *
 * Pass `client` to run inside your own transaction.
 */
export async function addSuppressions(
  workspaceId: string,
  entries: SuppressionEntry[],
  opts: { userId?: string | null; client?: Client } = {},
): Promise<AddSuppressionsResult> {
  const client = opts.client ?? db;
  const invalid: string[] = [];
  // key → row to insert; the first entry for an address wins.
  const rows = new Map<string, { email: string; plain: string | null; reason: SuppressionReason; note: string | null }>();

  for (const entry of entries) {
    const raw = typeof entry?.email === "string" ? entry.email : "";
    const reason = entry?.reason;
    if (!reason || !(reason in SUPPRESSION_REASON_META)) {
      invalid.push(raw.trim().slice(0, 254));
      continue;
    }
    const note = cleanNote(entry.note);

    if (reason === "ERASURE" && isErasureKey(raw.trim().toLowerCase())) {
      const key = raw.trim().toLowerCase();
      if (!rows.has(key)) rows.set(key, { email: key, plain: null, reason, note });
      continue;
    }
    const parsed = emailSchema.safeParse(raw);
    if (!parsed.success) {
      invalid.push(raw.trim().slice(0, 254));
      continue;
    }
    const plain = parsed.data;
    const key = reason === "ERASURE" ? suppressionKeyForErasure(plain) : plain;
    if (!rows.has(key)) rows.set(key, { email: key, plain, reason, note });
  }

  let added = 0;
  let alreadyThere = 0;
  const createdById = opts.userId ?? null;

  for (const batch of chunks([...rows.values()], LOOKUP_BATCH)) {
    // Erasures: forget the plain address everywhere on the list.
    const erasedPlain = batch.filter((r) => r.reason === "ERASURE" && r.plain).map((r) => r.plain!);
    if (erasedPlain.length) {
      await client.suppression.deleteMany({ where: { workspaceId, email: { in: erasedPlain } } });
    }

    // Plain addresses of people who were already erased: don't store them again.
    const plainRows = batch.filter((r) => r.reason !== "ERASURE");
    const erasedAlready = plainRows.length
      ? new Set(
          (
            await client.suppression.findMany({
              where: { workspaceId, email: { in: plainRows.map((r) => suppressionKeyForErasure(r.email)) } },
              select: { email: true },
            })
          ).map((r) => r.email),
        )
      : new Set<string>();
    const toInsert = batch.filter((r) => r.reason === "ERASURE" || !erasedAlready.has(suppressionKeyForErasure(r.email)));

    const result = toInsert.length
      ? await client.suppression.createMany({
          data: toInsert.map((r) => ({ workspaceId, email: r.email, reason: r.reason, note: r.note, createdById })),
          // Already on the list → leave the existing row alone (no error).
          skipDuplicates: true,
        })
      : { count: 0 };
    added += result.count;
    alreadyThere += batch.length - result.count;
  }

  return { added, alreadyThere, invalid };
}

// ─── Removing ───────────────────────────────────────────────────────────────

/**
 * Removes one row. Returns false if it doesn't exist in this workspace, or
 * is an ERASURE row: those can never be removed (the person asked to be
 * forgotten; removing the hash would let them be re-imported and emailed).
 *
 * Complaint and bounce rows CAN be removed (by OWNER/ADMIN, checked in the
 * action) after a clear warning: sometimes a complaint was a mistake and the
 * person asks to be emailed again.
 */
export async function removeSuppression(workspaceId: string, id: string): Promise<boolean> {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return false;
  const result = await db.suppression.deleteMany({ where: { id, workspaceId, reason: { not: "ERASURE" } } });
  return result.count === 1;
}

// ─── Listing and export ─────────────────────────────────────────────────────

export const SUPPRESSIONS_PAGE_SIZE = 50;

export type SuppressionRow = {
  id: string;
  /** The address, or null for an erased (hashed) person. */
  email: string | null;
  reason: SuppressionReasonValue;
  note: string | null;
  createdAt: Date;
  /** Name (or email) of the user who added it; null = added automatically or user gone. */
  addedBy: string | null;
};

export type SuppressionListResult = {
  rows: SuppressionRow[];
  total: number;
  page: number;
  pageCount: number;
};

function listWhere(workspaceId: string, filters: { q?: string; reason?: SuppressionReasonValue }): Prisma.SuppressionWhereInput {
  const q = filters.q?.trim().toLowerCase();
  const where: Prisma.SuppressionWhereInput = { workspaceId };
  if (filters.reason) where.reason = filters.reason;
  if (q) {
    // A full address also finds an erased person (by their hash).
    const full = emailSchema.safeParse(q);
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      ...(full.success ? [{ email: suppressionKeyForErasure(full.data) }] : []),
    ];
  }
  return where;
}

/**
 * One page of the suppression list, newest first. Page numbers (not a
 * cursor) because the table shows "Page 2 of 7" with Previous/Next links.
 */
export async function listSuppressions(
  workspaceId: string,
  filters: { q?: string; reason?: SuppressionReasonValue; page?: number } = {},
): Promise<SuppressionListResult> {
  const where = listWhere(workspaceId, filters);
  const total = await db.suppression.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / SUPPRESSIONS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1) || 1), pageCount);

  const found = await db.suppression.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * SUPPRESSIONS_PAGE_SIZE,
    take: SUPPRESSIONS_PAGE_SIZE,
    select: { id: true, email: true, reason: true, note: true, createdAt: true, createdById: true },
  });
  const names = await userNames(found.map((r) => r.createdById));

  return {
    rows: found.map((r) => ({
      id: r.id,
      email: isErasureKey(r.email) ? null : r.email,
      reason: r.reason,
      note: r.note,
      createdAt: r.createdAt,
      addedBy: r.createdById ? (names.get(r.createdById) ?? null) : null,
    })),
    total,
    page,
    pageCount,
  };
}

/** How many rows the workspace has in total (for the page header). */
export async function countSuppressions(workspaceId: string): Promise<number> {
  return db.suppression.count({ where: { workspaceId } });
}

async function userNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name || u.email]));
}

/**
 * One CSV cell, quoted. Free text (the note) is also protected against
 * spreadsheet formulas ("=HYPERLINK(…)") by a leading apostrophe. Addresses
 * are left exact, so the file can be uploaded again.
 */
function csvCell(value: string, freeText = false): string {
  const safe = freeText && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * The whole list as CSV (email, reason, note, added_at). Erased people are
 * exported as their "sha256:…" key, so the file is a complete backup and can
 * be uploaded again here. Read in pages, so big lists don't load at once.
 */
export async function exportSuppressionsCsv(workspaceId: string): Promise<string> {
  const lines = ["email,reason,note,added_at"];
  let cursor: string | null = null;
  for (;;) {
    const page: { id: string; email: string; reason: SuppressionReason; note: string | null; createdAt: Date }[] =
      await db.suppression.findMany({
        where: { workspaceId },
        orderBy: { id: "asc" },
        take: LOOKUP_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, email: true, reason: true, note: true, createdAt: true },
      });
    for (const r of page) {
      lines.push([csvCell(r.email), csvCell(r.reason), csvCell(r.note ?? "", true), csvCell(r.createdAt.toISOString())].join(","));
    }
    if (page.length < LOOKUP_BATCH) break;
    cursor = page[page.length - 1].id;
  }
  return lines.join("\r\n") + "\r\n";
}
