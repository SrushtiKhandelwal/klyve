"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { deleteAttributeEverywhere } from "@/app/(dashboard)/contacts/attributes/data";
import { ATTRIBUTE_TYPES, attributeKeySchema } from "@/lib/contacts/common";
import { db } from "@/lib/db";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for custom contact fields. Anyone can call these with any
// input, so each one checks the workspace and validates everything again.

const idSchema = z.string().min(1).max(64);

const labelSchema = z
  .string()
  .trim()
  .min(1, "Give the field a name.")
  .max(60, "Name must be 60 characters or fewer.");

const CreateAttributeSchema = z.object({
  label: labelSchema,
  key: z.string().trim().pipe(attributeKeySchema),
  type: z.enum(ATTRIBUTE_TYPES, "Pick a type."),
});

export type CreateAttributeState =
  | {
      errors?: { label?: string[]; key?: string[]; type?: string[] };
      message?: string;
      success?: boolean;
      /** Changes on every success, so the dialog knows to close and reset. */
      createdAt?: number;
    }
  | undefined;

export async function createAttribute(
  _prev: CreateAttributeState,
  formData: FormData,
): Promise<CreateAttributeState> {
  const ws = await requireActiveWorkspace();

  const parsed = CreateAttributeSchema.safeParse({
    label: formData.get("label") ?? "",
    key: formData.get("key") ?? "",
    type: formData.get("type") ?? "",
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    await db.contactAttribute.create({
      data: { workspaceId: ws.id, ...parsed.data },
    });
  } catch (error) {
    // The database's unique rule on (workspaceId, key) catches duplicates,
    // even if two people create the same key at the same moment.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { errors: { key: [`You already have a field with the key ${parsed.data.key}.`] } };
    }
    console.error("createAttribute failed:", error);
    return { message: "Something went wrong creating the field. Please try again." };
  }

  refresh();
  return { success: true, createdAt: Date.now() };
}

export type AttributeActionResult = { ok: true } | { ok: false; error: string };

/** Only the label can change. The key and type stay fixed (templates and segments use them). */
export async function renameAttribute(attributeId: unknown, label: unknown): Promise<AttributeActionResult> {
  const ws = await requireActiveWorkspace();

  const id = idSchema.safeParse(attributeId);
  if (!id.success) return { ok: false, error: "Field not found." };
  const newLabel = labelSchema.safeParse(label);
  if (!newLabel.success) return { ok: false, error: newLabel.error.issues[0]?.message ?? "Invalid name." };

  const result = await db.contactAttribute.updateMany({
    where: { id: id.data, workspaceId: ws.id },
    data: { label: newLabel.data },
  });
  if (result.count === 0) return { ok: false, error: "Field not found." };

  refresh();
  return { ok: true };
}

/** Deletes the field and wipes its value from every contact in the workspace. */
export async function deleteAttribute(attributeId: unknown): Promise<AttributeActionResult> {
  const ws = await requireActiveWorkspace();

  const id = idSchema.safeParse(attributeId);
  if (!id.success) return { ok: false, error: "Field not found." };

  try {
    const deleted = await deleteAttributeEverywhere(ws.id, id.data);
    if (!deleted) return { ok: false, error: "Field not found." };
  } catch (error) {
    console.error("deleteAttribute failed:", error);
    return { ok: false, error: "Could not delete the field. Please try again." };
  }

  refresh();
  return { ok: true };
}
