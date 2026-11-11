"use server";

import { refresh } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { emailSchema, parseAttributeValue, readAttributes } from "@/lib/contacts/common";
import { getAttributeDefinitions } from "@/lib/contacts/lookups";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for contacts. They are public endpoints: anyone can call them
// with any input. So every action:
//   1. re-checks who is logged in and which workspace they're in,
//   2. validates its input with zod,
//   3. filters EVERY query by `workspaceId: ws.id`, so an id from another
//      workspace simply matches nothing.

// ─── Shared types & schemas ─────────────────────────────────────────────────

/** Result of a simple action (buttons, bulk actions). */
export type ContactActionResult = { ok: true; message: string } | { ok: false; message: string };

/** Result of the add/edit contact forms. `errors` is keyed by form field name. */
export type ContactFormResult =
  | { ok: true; contactId: string; message: string }
  | { ok: false; message?: string; errors?: Record<string, string[]> };

/** Name of the form field holding a custom attribute's value, e.g. "attr:CITY". */
// (Kept in sync with contact-attribute-fields.tsx.)
const ATTR_PREFIX = "attr:";

const idSchema = z.string().trim().min(1).max(64);

/** At most 1000 ids per bulk action, so one request can't run forever. */
const bulkIdsSchema = z
  .array(idSchema)
  .min(1, "Select at least one contact.")
  .max(1000, "You can change at most 1000 contacts at once.")
  .transform((ids) => [...new Set(ids)]);

const nameSchema = z
  .string()
  .trim()
  .max(100, "Must be 100 characters or fewer.")
  .transform((v) => (v === "" ? null : v));

const contactFieldsSchema = z.object({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
});

const DUPLICATE_EMAIL = "A contact with this email already exists in this workspace.";

function isUniqueClash(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** formData.get() can return a File; we only ever want text. */
function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Reads the custom field inputs from the form and turns each into the value we
 * store (number, date, yes/no...). Only the workspace's own attributes are
 * read, so a forged "attr:ANYTHING" field is ignored.
 */
async function readAttributeFields(workspaceId: string, formData: FormData) {
  const definitions = await getAttributeDefinitions(workspaceId);
  const values: Record<string, string | number | boolean | null> = {};
  const errors: Record<string, string[]> = {};

  for (const def of definitions) {
    const field = `${ATTR_PREFIX}${def.key}`;
    // Field not in the form at all → leave the stored value alone.
    if (!formData.has(field)) continue;
    const parsed = parseAttributeValue(def.type, text(formData, field));
    if (parsed.ok) values[def.key] = parsed.value;
    else errors[field] = [parsed.error];
  }

  return { values, errors };
}

/** True only if EVERY id is a list in this workspace. */
async function listsBelongToWorkspace(workspaceId: string, listIds: string[]) {
  if (listIds.length === 0) return true;
  const found = await db.contactList.count({ where: { workspaceId, id: { in: listIds } } });
  return found === listIds.length;
}

// ─── Create / update / delete one contact ───────────────────────────────────

const createSchema = contactFieldsSchema.extend({
  // A new contact can only start as subscribed or unsubscribed. BOUNCED and
  // COMPLAINED are set by the sending system, never by hand.
  status: z.enum(["SUBSCRIBED", "UNSUBSCRIBED"], "Choose a status."),
  listIds: z.array(idSchema).max(100).transform((ids) => [...new Set(ids)]),
});

export async function createContact(formData: FormData): Promise<ContactFormResult> {
  const ws = await requireActiveWorkspace();

  const parsed = createSchema.safeParse({
    email: text(formData, "email"),
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    status: text(formData, "status") || "SUBSCRIBED",
    listIds: formData.getAll("listIds").filter((v) => typeof v === "string"),
  });
  const attrs = await readAttributeFields(ws.id, formData);

  if (!parsed.success || Object.keys(attrs.errors).length > 0) {
    return {
      ok: false,
      errors: { ...(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors), ...attrs.errors },
    };
  }
  const { email, firstName, lastName, status, listIds } = parsed.data;

  // Never trust list ids from the browser: they must all be ours.
  if (!(await listsBelongToWorkspace(ws.id, listIds))) {
    return { ok: false, errors: { listIds: ["One of the selected lists no longer exists."] } };
  }

  // Don't store empty values: a missing key already means "no value".
  const attributes = Object.fromEntries(
    Object.entries(attrs.values).filter(([, value]) => value !== null),
  );

  try {
    const contact = await db.contact.create({
      data: {
        workspaceId: ws.id,
        email,
        firstName,
        lastName,
        status,
        attributes,
        source: "manual",
        lists: { create: listIds.map((listId) => ({ listId })) },
      },
      select: { id: true },
    });
    refresh();
    return { ok: true, contactId: contact.id, message: "Contact added." };
  } catch (error) {
    // The database's unique rule on (workspace, email) is the real referee.
    if (isUniqueClash(error)) return { ok: false, errors: { email: [DUPLICATE_EMAIL] } };
    console.error("createContact failed:", error);
    return { ok: false, message: "Something went wrong saving this contact. Please try again." };
  }
}

export async function updateContact(
  contactId: string,
  formData: FormData,
): Promise<ContactFormResult> {
  const ws = await requireActiveWorkspace();

  const id = idSchema.safeParse(contactId);
  if (!id.success) return { ok: false, message: "Contact not found." };

  const parsed = contactFieldsSchema.safeParse({
    email: text(formData, "email"),
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
  });
  const attrs = await readAttributeFields(ws.id, formData);

  if (!parsed.success || Object.keys(attrs.errors).length > 0) {
    return {
      ok: false,
      errors: { ...(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors), ...attrs.errors },
    };
  }

  // Load the current attributes (from THIS workspace only) so we can merge:
  // values for fields that aren't on the form are kept as they are.
  const existing = await db.contact.findFirst({
    where: { id: id.data, workspaceId: ws.id },
    select: { attributes: true },
  });
  if (!existing) return { ok: false, message: "Contact not found." };

  const attributes = { ...readAttributes(existing.attributes) };
  for (const [key, value] of Object.entries(attrs.values)) {
    if (value === null) delete attributes[key];
    else attributes[key] = value;
  }

  try {
    // updateMany lets us put workspaceId in the WHERE, so a forged id from
    // another workspace updates nothing.
    const result = await db.contact.updateMany({
      where: { id: id.data, workspaceId: ws.id },
      data: { ...parsed.data, attributes },
    });
    if (result.count === 0) return { ok: false, message: "Contact not found." };
    refresh();
    return { ok: true, contactId: id.data, message: "Contact saved." };
  } catch (error) {
    if (isUniqueClash(error)) return { ok: false, errors: { email: [DUPLICATE_EMAIL] } };
    console.error("updateContact failed:", error);
    return { ok: false, message: "Something went wrong saving this contact. Please try again." };
  }
}

/** Deletes one contact, then goes back to the contacts table. */
export async function deleteContact(contactId: string): Promise<ContactActionResult> {
  const ws = await requireActiveWorkspace();

  const id = idSchema.safeParse(contactId);
  if (!id.success) return { ok: false, message: "Contact not found." };

  try {
    // List memberships are removed automatically (onDelete: Cascade).
    const result = await db.contact.deleteMany({ where: { id: id.data, workspaceId: ws.id } });
    if (result.count === 0) return { ok: false, message: "Contact not found." };
  } catch (error) {
    console.error("deleteContact failed:", error);
    return { ok: false, message: "Couldn't delete this contact. Please try again." };
  }

  // Outside the try block: redirect() works by throwing. "replace" so the
  // Back button doesn't return to a page that no longer exists.
  redirect("/contacts", RedirectType.replace);
}

// ─── Status ──────────────────────────────────────────────────────────────────

const statusSchema = z.object({
  contactId: idSchema,
  status: z.enum(["SUBSCRIBED", "UNSUBSCRIBED"]),
  // Must be true to re-subscribe a BOUNCED or COMPLAINED contact.
  overrideBlocked: z.boolean().default(false),
});

/**
 * Manually subscribe or unsubscribe a contact.
 * BOUNCED / COMPLAINED contacts are protected: emailing them again hurts the
 * sender's reputation, so they can only be re-subscribed when the user has
 * explicitly confirmed the warning (overrideBlocked = true).
 */
export async function setContactStatus(input: {
  contactId: string;
  status: "SUBSCRIBED" | "UNSUBSCRIBED";
  overrideBlocked?: boolean;
}): Promise<ContactActionResult> {
  const ws = await requireActiveWorkspace();

  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { contactId, status, overrideBlocked } = parsed.data;

  const contact = await db.contact.findFirst({
    where: { id: contactId, workspaceId: ws.id },
    select: { status: true },
  });
  if (!contact) return { ok: false, message: "Contact not found." };

  const blocked = contact.status === "BOUNCED" || contact.status === "COMPLAINED";
  if (blocked && status === "UNSUBSCRIBED") {
    // Keep the bounce/complaint record: it explains WHY they can't be emailed.
    return { ok: false, message: "This contact already can't receive campaigns." };
  }
  if (blocked && !overrideBlocked) {
    return { ok: false, message: "Please confirm the warning before re-subscribing this contact." };
  }

  // The status is in the WHERE too, so if it changed since we read it (e.g.
  // a bounce just arrived) we don't silently overwrite it.
  const result = await db.contact.updateMany({
    where: { id: contactId, workspaceId: ws.id, status: contact.status },
    data: { status },
  });
  if (result.count === 0) {
    return { ok: false, message: "This contact changed in the meantime. Please reload and try again." };
  }

  refresh();
  return {
    ok: true,
    message: status === "SUBSCRIBED" ? "Contact marked as subscribed." : "Contact unsubscribed.",
  };
}

// ─── One contact ↔ one list ──────────────────────────────────────────────────

const membershipSchema = z.object({ contactId: idSchema, listId: idSchema });

export async function addContactToList(input: {
  contactId: string;
  listId: string;
}): Promise<ContactActionResult> {
  const ws = await requireActiveWorkspace();

  const parsed = membershipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { contactId, listId } = parsed.data;

  // BOTH the contact and the list must belong to this workspace.
  const [contact, list] = await Promise.all([
    db.contact.findFirst({ where: { id: contactId, workspaceId: ws.id }, select: { id: true } }),
    db.contactList.findFirst({ where: { id: listId, workspaceId: ws.id }, select: { name: true } }),
  ]);
  if (!contact) return { ok: false, message: "Contact not found." };
  if (!list) return { ok: false, message: "That list no longer exists." };

  // skipDuplicates: adding someone who's already in the list is not an error.
  await db.listMembership.createMany({ data: [{ contactId, listId }], skipDuplicates: true });
  refresh();
  return { ok: true, message: `Added to ${list.name}.` };
}

export async function removeContactFromList(input: {
  contactId: string;
  listId: string;
}): Promise<ContactActionResult> {
  const ws = await requireActiveWorkspace();

  const parsed = membershipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { contactId, listId } = parsed.data;

  // The relation filters make sure both sides are in this workspace.
  await db.listMembership.deleteMany({
    where: {
      contactId,
      listId,
      contact: { workspaceId: ws.id },
      list: { workspaceId: ws.id },
    },
  });
  refresh();
  return { ok: true, message: "Removed from list." };
}

// ─── Bulk actions (selected rows in the table) ──────────────────────────────

function plural(n: number, word: string) {
  return `${n.toLocaleString("en")} ${word}${n === 1 ? "" : "s"}`;
}

export async function bulkDeleteContacts(contactIds: string[]): Promise<ContactActionResult> {
  const ws = await requireActiveWorkspace();

  const ids = bulkIdsSchema.safeParse(contactIds);
  if (!ids.success) return { ok: false, message: ids.error.issues[0].message };

  const result = await db.contact.deleteMany({
    where: { id: { in: ids.data }, workspaceId: ws.id },
  });
  refresh();
  return { ok: true, message: `Deleted ${plural(result.count, "contact")}.` };
}

export async function bulkUnsubscribeContacts(contactIds: string[]): Promise<ContactActionResult> {
  const ws = await requireActiveWorkspace();

  const ids = bulkIdsSchema.safeParse(contactIds);
  if (!ids.success) return { ok: false, message: ids.error.issues[0].message };

  // Only SUBSCRIBED contacts change. Bounced/complained ones already can't be
  // emailed, and we keep that status because it says why.
  const result = await db.contact.updateMany({
    where: { id: { in: ids.data }, workspaceId: ws.id, status: "SUBSCRIBED" },
    data: { status: "UNSUBSCRIBED" },
  });
  refresh();
  return {
    ok: true,
    message:
      result.count === 0
        ? "None of the selected contacts were subscribed."
        : `Unsubscribed ${plural(result.count, "contact")}.`,
  };
}

const bulkListSchema = z.object({ contactIds: bulkIdsSchema, listId: idSchema });

export async function bulkAddToList(input: {
  contactIds: string[];
  listId: string;
}): Promise<ContactActionResult> {
  const ws = await requireActiveWorkspace();

  const parsed = bulkListSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { contactIds, listId } = parsed.data;

  const list = await db.contactList.findFirst({
    where: { id: listId, workspaceId: ws.id },
    select: { name: true },
  });
  if (!list) return { ok: false, message: "That list no longer exists." };

  // Keep only the ids that really are contacts in this workspace.
  const contacts = await db.contact.findMany({
    where: { id: { in: contactIds }, workspaceId: ws.id },
    select: { id: true },
  });

  const result = await db.listMembership.createMany({
    data: contacts.map((c) => ({ contactId: c.id, listId })),
    skipDuplicates: true, // people already in the list are left alone
  });
  refresh();
  return { ok: true, message: `Added ${plural(result.count, "contact")} to ${list.name}.` };
}

export async function bulkRemoveFromList(input: {
  contactIds: string[];
  listId: string;
}): Promise<ContactActionResult> {
  const ws = await requireActiveWorkspace();

  const parsed = bulkListSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { contactIds, listId } = parsed.data;

  const list = await db.contactList.findFirst({
    where: { id: listId, workspaceId: ws.id },
    select: { name: true },
  });
  if (!list) return { ok: false, message: "That list no longer exists." };

  const result = await db.listMembership.deleteMany({
    where: {
      listId,
      contactId: { in: contactIds },
      contact: { workspaceId: ws.id },
      list: { workspaceId: ws.id },
    },
  });
  refresh();
  return { ok: true, message: `Removed ${plural(result.count, "contact")} from ${list.name}.` };
}
