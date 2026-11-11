"use server";

import { refresh } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { emailSchema } from "@/lib/contacts/common";
import { requireActiveWorkspace } from "@/lib/workspace";
import {
  LIST_DESCRIPTION_MAX,
  LIST_NAME_MAX,
  MAX_CONTACTS_PER_REMOVE,
  MAX_EMAILS_PER_ADD,
  splitEmailInput,
} from "@/components/contacts/lists/list-rules";

// Server Actions for contact lists.
//
// Server Actions are public endpoints: anyone can call them with any input.
// So every action below:
//  1. works out the workspace from the session (requireActiveWorkspace), and
//  2. filters every query by that workspace's id.
// Ids sent by the browser (list ids, contact ids) are never trusted on their
// own: a list or contact from another workspace is treated as "not found".

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Ids are cuids (~25 chars). We only check the shape; the database checks ownership. */
const idSchema = z.string().trim().min(1).max(64);

const ListFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please give the list a name.")
    .max(LIST_NAME_MAX, `List names can be at most ${LIST_NAME_MAX} characters.`),
  description: z
    .string()
    .trim()
    .max(LIST_DESCRIPTION_MAX, `Keep the description under ${LIST_DESCRIPTION_MAX} characters.`)
    // An empty description is saved as "no description".
    .transform((value) => value || null),
});

/** What the create/edit list form gets back. */
export type ListFormState =
  | {
      errors?: { name?: string[]; description?: string[] };
      message?: string;
      // Sent back so the form keeps what the user typed.
      values?: { name: string; description: string };
      success?: boolean;
      /** The saved list (on success). */
      list?: { id: string; name: string };
    }
  | undefined;

/** Simple result for actions that aren't forms. */
export type ListActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function isUniqueClash(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * The database only blocks exact duplicates ("News" twice). We also block
 * "News" vs "news", which would just be confusing in a dropdown.
 */
async function findNameClash(workspaceId: string, name: string, exceptListId?: string) {
  return db.contactList.findFirst({
    where: {
      workspaceId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptListId ? { id: { not: exceptListId } } : {}),
    },
    select: { name: true },
  });
}

function duplicateNameError(name: string) {
  return { name: [`You already have a list called "${name}". Please pick another name.`] };
}

// ---------------------------------------------------------------------------
// Create / edit / delete a list
// ---------------------------------------------------------------------------

export async function createList(
  _prevState: ListFormState,
  formData: FormData,
): Promise<ListFormState> {
  const ws = await requireActiveWorkspace();

  const values = { name: text(formData, "name"), description: text(formData, "description") };
  const parsed = ListFieldsSchema.safeParse(values);
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values };
  }

  const clash = await findNameClash(ws.id, parsed.data.name);
  if (clash) return { errors: duplicateNameError(clash.name), values };

  try {
    const list = await db.contactList.create({
      data: { workspaceId: ws.id, name: parsed.data.name, description: parsed.data.description },
      select: { id: true, name: true },
    });
    refresh();
    return { success: true, list };
  } catch (error) {
    // Someone created the same name a split second ago.
    if (isUniqueClash(error)) return { errors: duplicateNameError(parsed.data.name), values };
    console.error("createList failed:", error);
    return { message: "Something went wrong creating the list. Please try again.", values };
  }
}

/** Use with .bind(null, listId) so the form only sends the fields. */
export async function updateList(
  listId: string,
  _prevState: ListFormState,
  formData: FormData,
): Promise<ListFormState> {
  const ws = await requireActiveWorkspace();

  const values = { name: text(formData, "name"), description: text(formData, "description") };
  const id = idSchema.safeParse(listId);
  if (!id.success) return { message: "This list no longer exists.", values };

  const parsed = ListFieldsSchema.safeParse(values);
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values };
  }

  const clash = await findNameClash(ws.id, parsed.data.name, id.data);
  if (clash) return { errors: duplicateNameError(clash.name), values };

  try {
    // updateMany with BOTH id and workspaceId: a forged id from another
    // workspace matches nothing, so nothing changes.
    const { count } = await db.contactList.updateMany({
      where: { id: id.data, workspaceId: ws.id },
      data: { name: parsed.data.name, description: parsed.data.description },
    });
    if (count === 0) return { message: "This list no longer exists.", values };

    refresh();
    return { success: true, list: { id: id.data, name: parsed.data.name } };
  } catch (error) {
    if (isUniqueClash(error)) return { errors: duplicateNameError(parsed.data.name), values };
    console.error("updateList failed:", error);
    return { message: "Something went wrong saving the list. Please try again.", values };
  }
}

/**
 * Deletes a list. Its memberships go with it (database cascade), but the
 * contacts themselves are kept.
 * Pass `{ redirectToLists: true }` when deleting from the list's own page, so
 * we go back to all lists instead of re-showing a page that no longer exists.
 */
export async function deleteList(
  listId: string,
  options?: { redirectToLists?: boolean },
): Promise<ListActionResult> {
  const ws = await requireActiveWorkspace();

  const id = idSchema.safeParse(listId);
  if (!id.success) return { ok: false, error: "This list no longer exists." };

  let count: number;
  try {
    ({ count } = await db.contactList.deleteMany({ where: { id: id.data, workspaceId: ws.id } }));
  } catch (error) {
    console.error("deleteList failed:", error);
    return { ok: false, error: "Something went wrong deleting the list. Please try again." };
  }
  if (count === 0) return { ok: false, error: "This list no longer exists." };

  // redirect() must be called outside try/catch (it works by throwing).
  if (options?.redirectToLists === true) redirect("/contacts/lists", RedirectType.replace);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Add contacts to a list by pasting emails
// ---------------------------------------------------------------------------

/** We send back at most this many problem emails, to keep the response small. */
const MAX_REPORTED = 50;

export type AddEmailsSummary = {
  /** New memberships created. */
  added: number;
  /** Contacts that were already in this list. */
  alreadyInList: number;
  /** New contacts created (only with "Also create missing contacts"). */
  created: number;
  /** Entries that aren't valid email addresses (first 50) and how many in total. */
  invalid: string[];
  invalidCount: number;
  /** Valid emails with no contact yet, when creating was NOT allowed (first 50). */
  notFound: string[];
  notFoundCount: number;
};

export type AddEmailsState =
  | {
      message?: string;
      values?: { emails: string; createMissing: boolean };
      success?: boolean;
      summary?: AddEmailsSummary;
    }
  | undefined;

/** Use with .bind(null, listId). Form fields: `emails` (text) and `createMissing` (checkbox). */
export async function addEmailsToList(
  listId: string,
  _prevState: AddEmailsState,
  formData: FormData,
): Promise<AddEmailsState> {
  const ws = await requireActiveWorkspace();

  const rawEmails = text(formData, "emails");
  const createMissing = ["on", "true", "yes"].includes(text(formData, "createMissing"));
  const values = { emails: rawEmails, createMissing };

  const id = idSchema.safeParse(listId);
  if (!id.success) return { message: "This list no longer exists.", values };

  // Rough size guard before we do any work (1000 long emails ≈ 260 KB).
  if (rawEmails.length > MAX_EMAILS_PER_ADD * 300) {
    return { message: `That's too much text. Paste at most ${MAX_EMAILS_PER_ADD} emails at a time.`, values };
  }

  const entries = splitEmailInput(rawEmails);
  if (entries.length === 0) return { message: "Paste at least one email address.", values };
  if (entries.length > MAX_EMAILS_PER_ADD) {
    return {
      message: `You pasted ${entries.length} entries. Please add at most ${MAX_EMAILS_PER_ADD} at a time.`,
      values,
    };
  }

  // Check every entry with the shared email rule (which also lower-cases it).
  const valid = new Set<string>();
  const invalid: string[] = [];
  for (const entry of entries) {
    const result = emailSchema.safeParse(entry);
    if (result.success) valid.add(result.data);
    else invalid.push(entry);
  }
  const validEmails = [...valid];

  // The list must belong to this workspace.
  const list = await db.contactList.findFirst({
    where: { id: id.data, workspaceId: ws.id },
    select: { id: true },
  });
  if (!list) return { message: "This list no longer exists.", values };

  let summary: AddEmailsSummary;
  try {
    summary = await db.$transaction(async (tx) => {
      let created = 0;
      if (createMissing && validEmails.length > 0) {
        // skipDuplicates: emails that already exist in this workspace are left
        // alone (we never overwrite an existing contact's status).
        const result = await tx.contact.createMany({
          data: validEmails.map((email) => ({
            workspaceId: ws.id,
            email,
            status: "SUBSCRIBED" as const,
            source: "manual",
          })),
          skipDuplicates: true,
        });
        created = result.count;
      }

      // Only contacts from THIS workspace are ever linked to the list.
      const contacts =
        validEmails.length === 0
          ? []
          : await tx.contact.findMany({
              where: { workspaceId: ws.id, email: { in: validEmails } },
              select: { id: true, email: true },
            });

      const { count: added } =
        contacts.length === 0
          ? { count: 0 }
          : await tx.listMembership.createMany({
              data: contacts.map((c) => ({ listId: list.id, contactId: c.id })),
              // Already a member? Skip it instead of failing.
              skipDuplicates: true,
            });

      const foundEmails = new Set(contacts.map((c) => c.email));
      const notFound = validEmails.filter((email) => !foundEmails.has(email));

      return {
        added,
        alreadyInList: contacts.length - added,
        created,
        invalid: invalid.slice(0, MAX_REPORTED),
        invalidCount: invalid.length,
        notFound: notFound.slice(0, MAX_REPORTED),
        notFoundCount: notFound.length,
      };
    });
  } catch (error) {
    console.error("addEmailsToList failed:", error);
    return { message: "Something went wrong adding contacts. Please try again.", values };
  }

  refresh();
  return { success: true, summary, values };
}

// ---------------------------------------------------------------------------
// Remove contacts from a list
// ---------------------------------------------------------------------------

const RemoveSchema = z.object({
  listId: idSchema,
  contactIds: z
    .array(idSchema)
    .min(1, "Select at least one contact.")
    .max(MAX_CONTACTS_PER_REMOVE, `You can remove at most ${MAX_CONTACTS_PER_REMOVE} contacts at a time.`),
});

/** Removes contacts from the list only. The contacts themselves are kept. */
export async function removeContactsFromList(
  listId: string,
  contactIds: string[],
): Promise<ListActionResult<{ removed: number }>> {
  const ws = await requireActiveWorkspace();

  const parsed = RemoveSchema.safeParse({ listId, contactIds });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  try {
    // `list: { workspaceId }` makes this a no-op for a list in another workspace.
    const { count } = await db.listMembership.deleteMany({
      where: {
        listId: parsed.data.listId,
        list: { workspaceId: ws.id },
        contactId: { in: [...new Set(parsed.data.contactIds)] },
      },
    });
    refresh();
    return { ok: true, removed: count };
  } catch (error) {
    console.error("removeContactsFromList failed:", error);
    return { ok: false, error: "Something went wrong removing contacts. Please try again." };
  }
}
