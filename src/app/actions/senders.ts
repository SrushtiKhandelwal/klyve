"use server";

import { refresh } from "next/cache";
import {
  createSender,
  deleteSender,
  sendVerificationCode,
  updateSender,
  verifySenderCode,
  type CreateSenderResult,
  type SendCodeResult,
  type SenderInput,
  type SimpleResult,
  type VerifyResult,
} from "@/lib/email/senders";
import { requireActiveWorkspace, type ActiveWorkspace } from "@/lib/workspace";

// Server Actions for Settings → Senders. Anyone can call these with any input,
// so each one checks the workspace (and role) itself and the library
// validates everything again. Ids from the browser are only ever used
// TOGETHER with the workspace id, so another workspace's id finds nothing.

const NOT_ALLOWED = "Only workspace owners and admins can change senders.";

function canManage(ws: ActiveWorkspace) {
  return ws.role === "OWNER" || ws.role === "ADMIN";
}

/** Plain object with only the fields we accept (ignores anything extra the browser sends). */
function pickInput(input: unknown): SenderInput {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return { email: v.email, name: v.name, replyTo: v.replyTo, providerId: v.providerId };
}

/** Adds a sender (OWNER/ADMIN) and emails it a verification code. */
export async function addSender(input: unknown): Promise<CreateSenderResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };

  try {
    const result = await createSender(ws.id, pickInput(input));
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("addSender failed:", error);
    return { ok: false, error: "Something went wrong adding the sender. Please try again." };
  }
}

/** Sends a fresh code. Anyone in the workspace may do this (it's rate-limited). */
export async function resendVerificationCode(senderId: unknown): Promise<SendCodeResult> {
  const ws = await requireActiveWorkspace();
  try {
    const result = await sendVerificationCode(ws.id, String(senderId ?? ""));
    refresh();
    return result;
  } catch (error) {
    console.error("resendVerificationCode failed:", error);
    return { ok: false, error: "Something went wrong sending the code. Please try again." };
  }
}

/** Checks a code. Anyone in the workspace may enter it (whoever reads that inbox). */
export async function submitVerificationCode(senderId: unknown, code: unknown): Promise<VerifyResult> {
  const ws = await requireActiveWorkspace();
  try {
    const result = await verifySenderCode(ws.id, String(senderId ?? ""), code);
    // Refresh on failure too: the attempts left / "need a new code" state changed.
    refresh();
    return result;
  } catch (error) {
    console.error("submitVerificationCode failed:", error);
    return { ok: false, error: "Something went wrong checking the code. Please try again." };
  }
}

/** Edits name, reply-to and provider (OWNER/ADMIN). The email can't change. */
export async function editSender(senderId: unknown, input: unknown): Promise<SimpleResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };

  try {
    const result = await updateSender(ws.id, String(senderId ?? ""), pickInput(input));
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("editSender failed:", error);
    return { ok: false, error: "Something went wrong saving the sender. Please try again." };
  }
}

export async function removeSender(senderId: unknown): Promise<SimpleResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };

  try {
    const result = await deleteSender(ws.id, String(senderId ?? ""));
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("removeSender failed:", error);
    return { ok: false, error: "Something went wrong deleting the sender. Please try again." };
  }
}
