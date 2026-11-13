"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { addSuppressions, isErasureKey, removeSuppression, type SuppressionEntry } from "@/lib/suppression";
import {
  MANUAL_REASONS,
  MAX_SUPPRESSIONS_PER_ADD,
  SUPPRESSION_NOTE_MAX,
  SUPPRESSION_REASON_META,
} from "@/lib/suppression/meta";
import { requireActiveWorkspace, type ActiveWorkspace } from "@/lib/workspace";

// Server Actions for the suppression list (/contacts/suppression).
// They are public endpoints: anyone can call them with any input. So each one
//   1. works out the workspace from the session (never from the browser),
//   2. allows only OWNER and ADMIN (a MEMBER can look, not change), and
//   3. re-validates everything: the browser only splits the text / reads the
//      CSV file for convenience; every address is checked again here.

export type AddSuppressionsActionResult =
  | {
      ok: true;
      added: number;
      alreadyThere: number;
      /** Entries that aren't valid addresses (first 50) and how many in total. */
      invalid: string[];
      invalidCount: number;
    }
  | { ok: false; error: string };

export type RemoveSuppressionResult = { ok: true; message: string } | { ok: false; error: string };

/** We send back at most this many invalid entries, to keep the response small. */
const MAX_REPORTED = 50;

const NOT_ALLOWED = "Only workspace owners and admins can change the suppression list.";

function canManage(ws: ActiveWorkspace): boolean {
  return ws.role === "OWNER" || ws.role === "ADMIN";
}

const addSchema = z.object({
  entries: z
    .array(z.string().max(400))
    .min(1, "Add at least one email address.")
    .max(
      MAX_SUPPRESSIONS_PER_ADD,
      `Please add at most ${MAX_SUPPRESSIONS_PER_ADD.toLocaleString("en-US")} addresses at a time.`,
    ),
  reason: z.enum(MANUAL_REASONS, "Choose a reason."),
  note: z
    .string()
    .trim()
    .max(SUPPRESSION_NOTE_MAX, `Keep the note under ${SUPPRESSION_NOTE_MAX} characters.`)
    .optional(),
});

/**
 * Adds pasted or uploaded addresses. Already-listed addresses are left as
 * they are. A "sha256:…" key (from an export of this list) is re-added as an
 * erased person, so an exported file can be uploaded again as a backup.
 */
export async function addSuppressionAddresses(input: {
  entries: string[];
  reason: string;
  note?: string;
}): Promise<AddSuppressionsActionResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { entries, reason, note } = parsed.data;

  const cleaned = entries.map((e) => e.trim()).filter(Boolean);
  if (cleaned.length === 0) return { ok: false, error: "Add at least one email address." };

  const toAdd: SuppressionEntry[] = cleaned.map((email) =>
    isErasureKey(email.toLowerCase())
      ? { email, reason: "ERASURE", note: note || null }
      : { email, reason, note: note || null },
  );

  try {
    const user = await getCurrentUser();
    const result = await addSuppressions(ws.id, toAdd, { userId: user?.id ?? null });
    refresh();
    return {
      ok: true,
      added: result.added,
      alreadyThere: result.alreadyThere,
      invalid: result.invalid.slice(0, MAX_REPORTED),
      invalidCount: result.invalid.length,
    };
  } catch (error) {
    console.error("addSuppressionAddresses failed:", error);
    return { ok: false, error: "Something went wrong adding these addresses. Please try again." };
  }
}

const idSchema = z.string().trim().min(1).max(64);

/**
 * Removes one address from the suppression list, so it may be emailed again.
 * ERASURE rows can never be removed (the person asked to be forgotten).
 */
export async function removeSuppressionEntry(id: string): Promise<RemoveSuppressionResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };

  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "This address is no longer on the list." };

  // Read first (from THIS workspace only) for a clear message.
  const row = await db.suppression.findFirst({
    where: { id: parsed.data, workspaceId: ws.id },
    select: { reason: true },
  });
  if (!row) return { ok: false, error: "This address is no longer on the list." };
  if (row.reason === "ERASURE") {
    return { ok: false, error: `${SUPPRESSION_REASON_META.ERASURE.label} entries can't be removed.` };
  }

  try {
    const removed = await removeSuppression(ws.id, parsed.data);
    if (!removed) return { ok: false, error: "This address is no longer on the list." };
  } catch (error) {
    console.error("removeSuppressionEntry failed:", error);
    return { ok: false, error: "Something went wrong removing this address. Please try again." };
  }
  refresh();
  return { ok: true, message: "Removed from the suppression list." };
}
