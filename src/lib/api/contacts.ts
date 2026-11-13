import "server-only";
import { z } from "zod";
import { Prisma, type ContactStatus } from "@/generated/prisma/client";
import { formatPath, type IssueDetail } from "@/lib/api/respond";
import { recordConsent } from "@/lib/consent";
import { emailSchema, normalizeEmail, parseAttributeValue, readAttributes, type AttributeValue } from "@/lib/contacts/common";
import { getAttributeDefinitions } from "@/lib/contacts/lookups";
import { db } from "@/lib/db";
import { addPendingContact } from "@/lib/optin";
import { findSuppression } from "@/lib/suppression";
import { suppressedMessage } from "@/lib/suppression/meta";

// Contacts through the public API: create-or-update ("upsert") one contact,
// and read one back.
//
// The same consent rules as the sign-up forms apply, because the API is how a
// workspace's own app adds people who signed up there:
//  - Someone UNSUBSCRIBED, BOUNCED or COMPLAINED is never re-subscribed, and a
//    suppressed address is never subscribed (or added at all, if it isn't a
//    contact yet). The answer says so in "note" instead of failing.
//  - In a double opt-in workspace, new contacts start as PENDING and get the
//    confirmation email (lib/optin addPendingContact).
//  - Each subscription is recorded as consent: source "api", with the key id.
// Contacts can't be DELETED with an API key (too dangerous if a key leaks):
// that's done in the dashboard.

// ── Input ───────────────────────────────────────────────────────────────────

const nameField = z
  .string()
  .max(100, "Keep names under 100 characters.")
  .transform((v) => v.replace(/\s+/g, " ").trim() || null)
  .nullable()
  .optional();

const idField = z.string().trim().min(1).max(40);

export const upsertContactSchema = z
  .object({
    email: emailSchema,
    firstName: nameField,
    lastName: nameField,
    /** { "CITY": "Pune", "AGE": 31 }. null clears a value. */
    attributes: z
      .record(z.string().max(40), z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]))
      .refine((v) => Object.keys(v).length <= 100, "At most 100 attributes at once.")
      .optional(),
    /** Lists to ADD the contact to (never removes it from other lists). */
    listIds: z
      .array(idField)
      .max(50, "At most 50 lists at once.")
      .transform((ids) => [...new Set(ids)])
      .optional(),
    status: z.enum(["subscribed", "unsubscribed"]).optional(),
    /** false → an existing contact is left exactly as it is. */
    updateExisting: z.boolean().default(true),
  })
  .strict();
export type UpsertContactInput = z.infer<typeof upsertContactSchema>;

// ── Output ──────────────────────────────────────────────────────────────────

/** The JSON object for one contact. */
export type PublicContact = {
  id: string;
  object: "contact";
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: Lowercase<ContactStatus>;
  attributes: Record<string, AttributeValue>;
  listIds: string[];
  createdAt: string;
  updatedAt: string;
};

const contactSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  attributes: true,
  createdAt: true,
  updatedAt: true,
  lists: { select: { listId: true }, orderBy: { addedAt: "asc" } },
} satisfies Prisma.ContactSelect;
type ContactRow = Prisma.ContactGetPayload<{ select: typeof contactSelect }>;

function toPublic(c: ContactRow): PublicContact {
  return {
    id: c.id,
    object: "contact",
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    status: c.status.toLowerCase() as Lowercase<ContactStatus>,
    attributes: readAttributes(c.attributes),
    listIds: c.lists.map((l) => l.listId),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function loadContact(workspaceId: string, id: string): Promise<PublicContact | null> {
  const row = await db.contact.findFirst({ where: { id, workspaceId }, select: contactSelect });
  return row ? toPublic(row) : null;
}

/** One contact by id or by email address (anything with an "@"), or null. */
export async function getApiContact(workspaceId: string, idOrEmail: string): Promise<PublicContact | null> {
  const value = idOrEmail.trim();
  if (!value || value.length > 254) return null;
  const row = value.includes("@")
    ? await db.contact.findUnique({ where: { workspaceId_email: { workspaceId, email: normalizeEmail(value) } }, select: contactSelect })
    : /^[A-Za-z0-9_-]{1,40}$/.test(value)
      ? await db.contact.findFirst({ where: { id: value, workspaceId }, select: contactSelect })
      : null;
  return row ? toPublic(row) : null;
}

// ── Upsert ──────────────────────────────────────────────────────────────────

export type UpsertResult =
  | { ok: true; created: boolean; contact: PublicContact; note?: string }
  | { ok: false; message: string; details: IssueDetail[] };

const NEVER_RESUBSCRIBE: ContactStatus[] = ["UNSUBSCRIBED", "BOUNCED", "COMPLAINED"];

const STATUS_NOTES: Partial<Record<ContactStatus, string>> = {
  UNSUBSCRIBED: "This contact unsubscribed, so the API can't subscribe them again. They can re-subscribe themselves through a sign-up form or the preference centre.",
  BOUNCED: "Emails to this address bounced, so the API can't subscribe it again.",
  COMPLAINED: "This contact marked an email as spam, so the API can't subscribe them again.",
};
const SUPPRESSED_NOTE = "This address is on your suppression list, so it stays unsubscribed from campaigns.";

/** Checks attribute keys and values against the workspace's custom fields. */
async function checkAttributes(
  workspaceId: string,
  raw: Record<string, AttributeValue> | undefined,
): Promise<{ values: Record<string, AttributeValue>; problems: IssueDetail[] }> {
  const values: Record<string, AttributeValue> = {};
  const problems: IssueDetail[] = [];
  if (!raw || Object.keys(raw).length === 0) return { values, problems };
  const defs = new Map((await getAttributeDefinitions(workspaceId)).map((d) => [d.key, d]));
  for (const [key, value] of Object.entries(raw)) {
    const path = formatPath(["attributes", key]);
    const def = defs.get(key.toUpperCase());
    if (!def) {
      problems.push({ path, message: `Unknown attribute "${key}". Create it in Contacts → Attributes first.` });
      continue;
    }
    const parsed = parseAttributeValue(def.type, value);
    if (parsed.ok) values[def.key] = parsed.value;
    else problems.push({ path, message: parsed.error });
  }
  return { values, problems };
}

/** Every list id must be one of this workspace's lists. */
async function checkLists(workspaceId: string, listIds: string[]): Promise<IssueDetail[]> {
  if (listIds.length === 0) return [];
  const found = new Set(
    (await db.contactList.findMany({ where: { workspaceId, id: { in: listIds } }, select: { id: true } })).map((l) => l.id),
  );
  return listIds.flatMap((id, i) =>
    found.has(id) ? [] : [{ path: formatPath(["listIds", i]), message: `No list with id "${id}" in this workspace.` }],
  );
}

const isUniqueClash = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * Creates the contact, or updates it if the address is already a contact.
 * `apiKeyId` goes into the consent record, so it's clear which key did it.
 */
export async function upsertApiContact(
  ws: { id: string; name: string },
  input: UpsertContactInput,
  apiKeyId: string,
): Promise<UpsertResult> {
  const workspaceId = ws.id;
  const [attrs, listProblems] = await Promise.all([checkAttributes(workspaceId, input.attributes), checkLists(workspaceId, input.listIds ?? [])]);
  const problems = [...attrs.problems, ...listProblems];
  if (problems.length) return { ok: false, message: "Some fields are invalid. See details.", details: problems };

  const listIds = input.listIds ?? [];
  const existing = await db.contact.findUnique({
    where: { workspaceId_email: { workspaceId, email: input.email } },
    select: { id: true, status: true, attributes: true },
  });
  if (existing) return updateExisting(ws, existing, input, attrs.values, listIds, apiKeyId);

  // ── A new contact ──
  const suppression = await findSuppression(workspaceId, input.email);
  if (suppression) {
    // Same rule as "Add contact" in the dashboard: never (re)create an address
    // this workspace must not email.
    return {
      ok: false,
      message: "This address can't be added.",
      details: [{ path: "email", message: suppressedMessage(suppression.reason) }],
    };
  }
  // Don't store empty values: a missing key already means "no value".
  const attributes = Object.fromEntries(Object.entries(attrs.values).filter(([, v]) => v !== null));
  const wantsUnsubscribed = input.status === "unsubscribed";

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { doubleOptIn: true } });
  if (workspace?.doubleOptIn && !wantsUnsubscribed) {
    // Double opt-in: PENDING + confirmation email (and its consent records).
    const added = await addPendingContact(workspaceId, {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      attributes,
      listIds,
      source: "api",
      detail: { apiKeyId },
    });
    if (!added.contactId) {
      return { ok: false, message: "This address can't be added.", details: [{ path: "email", message: SUPPRESSED_NOTE }] };
    }
    const contact = await loadContact(workspaceId, added.contactId);
    if (!contact) throw new Error("Contact vanished right after being added.");
    const note =
      contact.status === "pending"
        ? added.sent
          ? "Double opt-in is on: we emailed them a confirmation link. They become subscribed once they click it."
          : "Double opt-in is on, but the confirmation email couldn't be sent (check the sender in Settings → Compliance). The contact is waiting for confirmation."
        : undefined;
    return { ok: true, created: added.created, contact, ...(note ? { note } : {}) };
  }

  try {
    const row = await db.contact.create({
      data: {
        workspaceId,
        email: input.email,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        status: wantsUnsubscribed ? "UNSUBSCRIBED" : "SUBSCRIBED",
        source: "api",
        attributes: attributes as Prisma.InputJsonValue,
        lists: listIds.length ? { create: listIds.map((listId) => ({ listId })) } : undefined,
      },
      select: contactSelect,
    });
    if (!wantsUnsubscribed) {
      await recordConsent({
        workspaceId,
        contactId: row.id,
        email: row.email,
        type: "SUBSCRIBED",
        source: "api",
        detail: { apiKeyId, lists: listIds },
      });
    }
    return { ok: true, created: true, contact: toPublic(row) };
  } catch (error) {
    // Two requests for the same new address at once: the database's unique
    // rule lets one create it; the other carries on as an update.
    if (!isUniqueClash(error)) throw error;
    const now = await db.contact.findUnique({
      where: { workspaceId_email: { workspaceId, email: input.email } },
      select: { id: true, status: true, attributes: true },
    });
    if (!now) throw error;
    return updateExisting(ws, now, input, attrs.values, listIds, apiKeyId);
  }
}

async function updateExisting(
  ws: { id: string; name: string },
  existing: { id: string; status: ContactStatus; attributes: Prisma.JsonValue },
  input: UpsertContactInput,
  attrValues: Record<string, AttributeValue>,
  listIds: string[],
  apiKeyId: string,
): Promise<UpsertResult> {
  const workspaceId = ws.id;
  const load = async (note?: string): Promise<UpsertResult> => {
    const contact = await loadContact(workspaceId, existing.id);
    if (!contact) throw new Error("Contact vanished during an update.");
    return { ok: true, created: false, contact, ...(note ? { note } : {}) };
  };

  if (!input.updateExisting) {
    return load("A contact with this email already exists. Nothing was changed because updateExisting is false.");
  }

  // ── Names, attributes, lists ──
  const data: Prisma.ContactUpdateManyMutationInput = {};
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (Object.keys(attrValues).length) {
    const merged: Record<string, AttributeValue> = { ...readAttributes(existing.attributes) };
    for (const [key, value] of Object.entries(attrValues)) {
      if (value === null) delete merged[key];
      else merged[key] = value;
    }
    data.attributes = merged as Prisma.InputJsonValue;
  }
  await db.$transaction([
    ...(Object.keys(data).length ? [db.contact.updateMany({ where: { id: existing.id, workspaceId }, data })] : []),
    ...(listIds.length
      ? [db.listMembership.createMany({ data: listIds.map((listId) => ({ listId, contactId: existing.id })), skipDuplicates: true })]
      : []),
  ]);

  // ── Status ──
  const notes: string[] = [];
  if (input.status === "unsubscribed") {
    if (existing.status === "SUBSCRIBED" || existing.status === "PENDING") {
      // The status is in the WHERE, so a change made meanwhile isn't overwritten.
      const changed = await db.contact.updateMany({
        where: { id: existing.id, workspaceId, status: existing.status },
        data: { status: "UNSUBSCRIBED" },
      });
      if (changed.count) {
        const contact = await db.contact.findFirst({ where: { id: existing.id, workspaceId }, select: { email: true } });
        await recordConsent({
          workspaceId,
          contactId: existing.id,
          email: contact?.email ?? input.email,
          type: "UNSUBSCRIBED",
          source: "api",
          detail: { apiKeyId, from: existing.status },
        });
      }
    }
    // BOUNCED / COMPLAINED already can't get campaigns, and that status says why: keep it.
  } else if (input.status === "subscribed") {
    const suppressed = await findSuppression(workspaceId, input.email);
    if (NEVER_RESUBSCRIBE.includes(existing.status)) {
      notes.push(STATUS_NOTES[existing.status]!);
    } else if (suppressed) {
      notes.push(SUPPRESSED_NOTE);
    } else if (existing.status === "PENDING") {
      // Still waiting for confirmation: re-sends the confirmation email (rate
      // limited), or subscribes them if double opt-in was turned off since.
      const again = await addPendingContact(workspaceId, { email: input.email, source: "api", detail: { apiKeyId } });
      const after = await db.contact.findFirst({ where: { id: existing.id, workspaceId }, select: { status: true } });
      if (after?.status === "PENDING") {
        notes.push(
          again.sent
            ? "This contact hasn't confirmed yet: we sent the confirmation email again."
            : "This contact hasn't clicked the confirmation link yet (a confirmation email was sent recently, so none was sent now).",
        );
      }
    }
  }
  return load(notes.join(" ") || undefined);
}
