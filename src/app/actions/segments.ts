"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  countSegment,
  previewSegment,
  validateRulesForWorkspace,
  type SegmentPreviewContact,
} from "@/lib/segments/engine";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions are public endpoints: anyone can call them with any input.
// So every action checks the workspace itself and validates everything it
// receives, even though the rule builder already checked it in the browser.

const idSchema = z.string().min(1).max(64);

const segmentNameSchema = z
  .string()
  .trim()
  .min(1, "Give your segment a name.")
  .max(100, "Name must be 100 characters or fewer.");

// ─────────────────────────────────────────────
// Live preview
// ─────────────────────────────────────────────

export type SegmentPreviewResult =
  | { ok: true; count: number; contacts: SegmentPreviewContact[] }
  | { ok: false; errors: string[] };

/** How many contacts match, plus the first 10. Used by the rule builder. */
export async function previewSegmentRules(rules: unknown): Promise<SegmentPreviewResult> {
  const ws = await requireActiveWorkspace();

  const checked = await validateRulesForWorkspace(ws.id, rules);
  if (!checked.ok) return { ok: false, errors: checked.errors };

  try {
    const [count, contacts] = await Promise.all([
      countSegment(ws.id, checked.checked),
      previewSegment(ws.id, checked.checked, { limit: 10 }),
    ]);
    return { ok: true, count, contacts };
  } catch (error) {
    console.error("previewSegmentRules failed:", error);
    return { ok: false, errors: ["Could not load the preview. Please try again."] };
  }
}

// ─────────────────────────────────────────────
// Save (create or update)
// ─────────────────────────────────────────────

export type SaveSegmentResult =
  | { ok: true; id: string }
  | { ok: false; error: string; nameError?: string; ruleErrors?: string[] };

const SaveSegmentSchema = z.object({
  id: idSchema.optional(),
  name: z.string(),
  rules: z.unknown(),
});

export async function saveSegment(input: unknown): Promise<SaveSegmentResult> {
  const ws = await requireActiveWorkspace();

  const parsed = SaveSegmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const name = segmentNameSchema.safeParse(parsed.data.name);
  if (!name.success) {
    const message = name.error.issues[0]?.message ?? "Invalid name.";
    return { ok: false, error: message, nameError: message };
  }

  const checked = await validateRulesForWorkspace(ws.id, parsed.data.rules);
  if (!checked.ok) {
    return { ok: false, error: "Please fix the highlighted conditions.", ruleErrors: checked.errors };
  }
  // Save the cleaned-up copy, never the raw input from the browser.
  const rules = checked.rules as Prisma.InputJsonValue;

  try {
    let id: string;
    if (parsed.data.id) {
      // Scoped by workspaceId: an id from another workspace updates nothing.
      const result = await db.segment.updateMany({
        where: { id: parsed.data.id, workspaceId: ws.id },
        data: { name: name.data, rules },
      });
      if (result.count === 0) return { ok: false, error: "This segment no longer exists." };
      id = parsed.data.id;
    } else {
      const created = await db.segment.create({
        data: { workspaceId: ws.id, name: name.data, rules },
        select: { id: true },
      });
      id = created.id;
    }
    refresh();
    return { ok: true, id };
  } catch (error) {
    if (isUniqueClash(error)) {
      const message = "You already have a segment with this name.";
      return { ok: false, error: message, nameError: message };
    }
    console.error("saveSegment failed:", error);
    return { ok: false, error: "Something went wrong saving the segment. Please try again." };
  }
}

// ─────────────────────────────────────────────
// Duplicate and delete
// ─────────────────────────────────────────────

export type SegmentActionResult = { ok: true; id: string } | { ok: false; error: string };

/** Copies a saved segment as "Name (copy)", "Name (copy 2)", ... */
export async function duplicateSegment(segmentId: unknown): Promise<SegmentActionResult> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(segmentId);
  if (!id.success) return { ok: false, error: "Segment not found." };

  const original = await db.segment.findFirst({
    where: { id: id.data, workspaceId: ws.id },
    select: { name: true, rules: true },
  });
  if (!original) return { ok: false, error: "Segment not found." };

  for (let n = 1; n <= 20; n++) {
    const suffix = n === 1 ? " (copy)" : ` (copy ${n})`;
    const name = original.name.slice(0, 100 - suffix.length) + suffix;
    try {
      const copy = await db.segment.create({
        data: { workspaceId: ws.id, name, rules: original.rules as Prisma.InputJsonValue },
        select: { id: true },
      });
      refresh();
      return { ok: true, id: copy.id };
    } catch (error) {
      if (!isUniqueClash(error)) {
        console.error("duplicateSegment failed:", error);
        return { ok: false, error: "Could not duplicate the segment. Please try again." };
      }
      // That name is taken: try the next number.
    }
  }
  return { ok: false, error: "Too many copies already. Rename one and try again." };
}

export async function deleteSegment(
  segmentId: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(segmentId);
  if (!id.success) return { ok: false, error: "Segment not found." };

  // deleteMany + workspaceId: deleting another workspace's segment is impossible.
  const result = await db.segment.deleteMany({ where: { id: id.data, workspaceId: ws.id } });
  if (result.count === 0) return { ok: false, error: "Segment not found." };

  refresh();
  return { ok: true };
}

function isUniqueClash(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
