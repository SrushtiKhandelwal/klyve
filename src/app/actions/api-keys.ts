"use server";

import { refresh } from "next/cache";
import { createApiKey, renameApiKey, revokeApiKey, type CreateApiKeyResult, type SimpleKeyResult } from "@/lib/api/keys";
import { getCurrentUser } from "@/lib/session";
import { requireActiveWorkspace, type ActiveWorkspace } from "@/lib/workspace";

// Server Actions for Settings → API keys. Anyone can call these with any
// input, so each one checks the workspace AND the role itself. Key ids from
// the browser are only ever used together with the workspace id, so another
// workspace's key id simply finds nothing.

const NOT_ALLOWED = "Only workspace owners and admins can manage API keys.";

function canManage(ws: ActiveWorkspace) {
  return ws.role === "OWNER" || ws.role === "ADMIN";
}

/**
 * Creates a key. The full key is in the result ONCE: it's shown in the dialog
 * and never stored (only its hash is), so it can't be fetched again later.
 */
export async function createApiKeyAction(name: unknown): Promise<CreateApiKeyResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };
  const user = await getCurrentUser();

  try {
    const result = await createApiKey({ id: ws.id }, user?.id ?? null, name);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("createApiKeyAction failed:", error);
    return { ok: false, error: "Something went wrong creating the key. Please try again." };
  }
}

export async function renameApiKeyAction(id: unknown, name: unknown): Promise<SimpleKeyResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };

  try {
    const result = await renameApiKey(ws.id, String(id ?? ""), name);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("renameApiKeyAction failed:", error);
    return { ok: false, error: "Something went wrong renaming the key. Please try again." };
  }
}

/** Revokes a key: apps using it get "401 unauthorized" from the next request on. */
export async function revokeApiKeyAction(id: unknown): Promise<SimpleKeyResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };

  try {
    const result = await revokeApiKey(ws.id, String(id ?? ""));
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("revokeApiKeyAction failed:", error);
    return { ok: false, error: "Something went wrong revoking the key. Please try again." };
  }
}
