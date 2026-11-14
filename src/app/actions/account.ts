"use server";

import { cookies, headers } from "next/headers";
import { isAPIError } from "better-auth/api";
import { getDeletionPlan } from "@/lib/account-deletion";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createRateLimiter } from "@/lib/media/rate-limit";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace";

// Settings → Profile → "Delete account".
//
// Safety checks before anything is deleted:
// 1. You typed DELETE (no accidental clicks).
// 2. Proof it's really you: your password, or, for accounts that only log in
//    with Google (no password), a login from the last RECENT_LOGIN_MINUTES.
// 3. Nothing blocks it (a workspace you own that other people use, or one
//    that's sending a campaign right now). See src/lib/account-deletion.ts.
// Better Auth then checks the password again, deletes the workspaces you own
// alone, deletes the user (logins, sessions and memberships go with it) and
// clears the login cookie.

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string; field?: "password" | "confirm"; needsFreshLogin?: boolean };

const RECENT_LOGIN_MINUTES = 15;

// Password guesses: 5 tries per 15 minutes per account.
const attempts = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

export async function deleteAccountAction(input: { password?: string; confirm?: string }): Promise<DeleteAccountResult> {
  const requestHeaders = await headers();
  const current = await auth.api.getSession({ headers: requestHeaders });
  if (!current) return { ok: false, error: "Please log in again." };
  const userId = current.user.id;

  if (typeof input?.confirm !== "string" || input.confirm.trim().toUpperCase() !== "DELETE") {
    return { ok: false, field: "confirm", error: "Type DELETE to confirm." };
  }

  const hasPassword = Boolean(
    await db.account.findFirst({ where: { userId, providerId: "credential" }, select: { id: true } }),
  );
  const password = typeof input.password === "string" ? input.password : "";

  if (hasPassword) {
    if (!password) return { ok: false, field: "password", error: "Please enter your password." };
  } else {
    const loggedInAt = new Date(current.session.createdAt).getTime();
    if (Date.now() - loggedInAt > RECENT_LOGIN_MINUTES * 60 * 1000) {
      return {
        ok: false,
        needsFreshLogin: true,
        error: `For your safety, log out and log in again with Google, then delete your account within ${RECENT_LOGIN_MINUTES} minutes.`,
      };
    }
  }

  const limit = attempts.hit(userId);
  if (!limit.ok) {
    return { ok: false, error: `Too many tries. Please wait ${Math.ceil(limit.retryAfterSeconds / 60)} minutes and try again.` };
  }

  const plan = await getDeletionPlan(userId);
  if (plan.blockers.length > 0) {
    return { ok: false, error: "Some workspaces need sorting out first (listed above)." };
  }

  try {
    await auth.api.deleteUser({ headers: requestHeaders, body: hasPassword ? { password } : {} });
  } catch (error) {
    if (isAPIError(error)) {
      const code = (error.body as { code?: string } | undefined)?.code;
      if (code === "INVALID_PASSWORD") return { ok: false, field: "password", error: "That password isn't right." };
      if (code === "SESSION_EXPIRED") {
        return { ok: false, needsFreshLogin: true, error: "For your safety, log out and log in again, then try once more." };
      }
      if (code === "ACCOUNT_DELETION_BLOCKED") {
        return { ok: false, error: "Some workspaces need sorting out first. Reload this page to see which." };
      }
    }
    console.error("[delete-account] failed:", error);
    return { ok: false, error: "Something went wrong. Please try again, or email us for help." };
  }

  // The login cookie is already cleared by Better Auth; forget the workspace choice too.
  (await cookies()).delete(ACTIVE_WORKSPACE_COOKIE);
  return { ok: true };
}
