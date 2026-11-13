"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { canDeleteForm, createForm, deleteForm, duplicateForm, formStatusSchema, saveForm } from "@/lib/forms/queries";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for sign-up forms. Anyone can call these with any input, so
// each one checks login + workspace itself and validates its input, and every
// id from the browser is only used TOGETHER with the active workspace's id
// (another workspace's form simply isn't found).
//
// WHO CAN DO WHAT
// - Any member: create, edit, duplicate, pause/resume.
// - OWNER/ADMIN only: delete (a deleted form's link stops working for good).

export type FormActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SERVER_ERROR = "Something went wrong. Please try again.";
const idSchema = z.string().min(1).max(64);

/** Creates a form (email + first name, in the brand's colours) and returns its id so the page can open the builder. */
export async function createFormAction(input: unknown): Promise<FormActionResult<{ formId: string }>> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const parsed = z.object({ name: z.string().max(500).optional() }).safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: "Give the form a name." };
  try {
    const result = await createForm(ws, user.id, { name: parsed.data.name });
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("createFormAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

// What the builder may change. `config` is checked in detail by saveForm.
const savePatchSchema = z
  .object({
    name: z.string().max(500).optional(),
    config: z.unknown().optional(),
    listIds: z.array(z.string().max(64)).max(200).optional(),
    status: formStatusSchema.optional(),
  })
  .strict();

/** The builder's autosave. No refresh(): the builder already shows what was saved. */
export async function saveFormAction(formId: unknown, patch: unknown): Promise<FormActionResult> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(formId);
  const parsed = savePatchSchema.safeParse(patch);
  if (!id.success || !parsed.success) return { ok: false, error: "These changes couldn't be read. Please reload the page." };
  try {
    const result = await saveForm(ws, id.data, parsed.data);
    return result.ok ? { ok: true } : result;
  } catch (error) {
    console.error("saveFormAction failed:", error);
    return { ok: false, error: "Couldn't save the form. Please try again." };
  }
}

/** Pause or resume a form (from the forms list). */
export async function setFormStatusAction(formId: unknown, status: unknown): Promise<FormActionResult> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(formId);
  const s = formStatusSchema.safeParse(status);
  if (!id.success || !s.success) return { ok: false, error: "Choose Active or Paused." };
  try {
    const result = await saveForm(ws, id.data, { status: s.data });
    if (result.ok) refresh();
    return result.ok ? { ok: true } : result;
  } catch (error) {
    console.error("setFormStatusAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

export async function duplicateFormAction(formId: unknown): Promise<FormActionResult<{ formId: string }>> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const id = idSchema.safeParse(formId);
  if (!id.success) return { ok: false, error: "This form doesn't exist (or was deleted)." };
  try {
    const result = await duplicateForm(ws, user.id, id.data);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("duplicateFormAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

export async function deleteFormAction(formId: unknown): Promise<FormActionResult> {
  const ws = await requireActiveWorkspace();
  if (!canDeleteForm(ws.role)) return { ok: false, error: "Only workspace owners and admins can delete forms." };
  const id = idSchema.safeParse(formId);
  if (!id.success) return { ok: false, error: "This form doesn't exist (or was deleted)." };
  try {
    const result = await deleteForm(ws, id.data);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("deleteFormAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}
