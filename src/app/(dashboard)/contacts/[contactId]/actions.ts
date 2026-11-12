"use server";

import { z } from "zod";
import { toActivityPageView, type ActivityPageView } from "@/components/contacts/activity/activity-view";
import { getContactActivity } from "@/lib/contacts/activity";
import { db } from "@/lib/db";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions are public endpoints, so this checks the workspace and the
// input itself, even though only the contact page calls it.

const inputSchema = z.object({
  contactId: z.string().min(1).max(64),
  cursor: z.string().min(1).max(200),
});

export type LoadActivityResult = { ok: true; page: ActivityPageView } | { ok: false; error: string };

/** The next (older) page of a contact's email activity, for "Show older". */
export async function loadOlderContactActivity(input: unknown): Promise<LoadActivityResult> {
  const ws = await requireActiveWorkspace();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  // Same answer for "doesn't exist" and "belongs to another workspace".
  const contact = await db.contact.findFirst({
    where: { id: parsed.data.contactId, workspaceId: ws.id },
    select: { id: true },
  });
  if (!contact) return { ok: false, error: "Contact not found." };

  try {
    const page = await getContactActivity(ws.id, contact.id, { cursor: parsed.data.cursor });
    return { ok: true, page: toActivityPageView(page) };
  } catch (error) {
    console.error("loadOlderContactActivity failed:", error);
    return { ok: false, error: "Could not load older activity. Please try again." };
  }
}
