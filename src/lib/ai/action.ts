import "server-only";
import { AiError, type AiErrorCode } from "@/lib/ai/errors";
import type { AiActor } from "@/lib/ai/run";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace, type ActiveWorkspace } from "@/lib/workspace";

// Small helpers shared by the AI Server Actions (src/app/actions/ai.ts).

/** What every AI action returns: { ok: true, … } or { ok: false, error, code }. */
export type AiActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; code?: AiErrorCode };

/**
 * Who is asking: the workspace and the person, BOTH worked out from the
 * session (never from the browser). Not logged in → /login.
 */
export async function getAiActor(): Promise<{ ws: ActiveWorkspace; actor: AiActor }> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  return { ws, actor: { workspaceId: ws.id, userId: user.id } };
}

/** Turns any error into an { ok: false } result with a message that is safe to show. */
export function aiFailure(where: string, error: unknown): { ok: false; error: string; code?: AiErrorCode } {
  if (error instanceof AiError) return { ok: false, error: error.message, code: error.code };
  // An unexpected bug: log what happened (no prompts are ever part of it) and stay vague.
  console.error(`${where} failed:`, error instanceof Error ? error.message : error);
  return { ok: false, error: "Something went wrong. Please try again." };
}
