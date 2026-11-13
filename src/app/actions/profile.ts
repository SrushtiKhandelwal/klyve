"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Settings → Security: "Where you're logged in".
//
// The list and these actions work with session IDs only. The secret session
// tokens never leave the server: we look the token up here (only among the
// logged-in user's OWN sessions) and ask Better Auth to end that session.

export type SessionActionResult = { ok: true } | { ok: false; error: string };

/** Logs one of your other devices out. */
export async function revokeSessionAction(sessionId: string): Promise<SessionActionResult> {
  const requestHeaders = await headers();
  const current = await auth.api.getSession({ headers: requestHeaders });
  if (!current) return { ok: false, error: "Please log in again." };
  if (typeof sessionId !== "string" || !sessionId) return { ok: false, error: "Invalid request." };
  if (sessionId === current.session.id) {
    return { ok: false, error: "That's this device. Use \"Log out\" in the menu instead." };
  }

  // userId in the query: you can only end your own sessions.
  const target = await db.session.findFirst({
    where: { id: sessionId, userId: current.user.id },
    select: { token: true },
  });
  if (!target) {
    // Already gone (expired, or logged out elsewhere): nothing left to do.
    refresh();
    return { ok: true };
  }

  try {
    await auth.api.revokeSession({ headers: requestHeaders, body: { token: target.token } });
  } catch (error) {
    console.error("revokeSessionAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  refresh();
  return { ok: true };
}

/** Logs every device out except this one. */
export async function revokeOtherSessionsAction(): Promise<SessionActionResult> {
  const requestHeaders = await headers();
  const current = await auth.api.getSession({ headers: requestHeaders });
  if (!current) return { ok: false, error: "Please log in again." };

  try {
    await auth.api.revokeOtherSessions({ headers: requestHeaders });
  } catch (error) {
    console.error("revokeOtherSessionsAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  refresh();
  return { ok: true };
}
