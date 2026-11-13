"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createRateLimiter } from "@/lib/media/rate-limit";
import { confirmByToken } from "@/lib/optin";

// The "Yes, subscribe me" button on the public /c/<token> page. No login:
// the signed token (sent back in a hidden field) is the only authorization,
// and it can only ever confirm the one contact it was made for.
//
// It ends with a redirect back to the page, which reads the CURRENT state
// from the database. That works with JavaScript switched off too: the
// browser posts a normal form and follows the 303 redirect.

/** Notices the page understands in ?notice=… (anything else is ignored). */
export type ConfirmNotice = "confirmed" | "busy";

// A light per-IP limit, so nobody can hammer the endpoint while guessing
// tokens. Generous, because a whole office can share one IP. Kept on
// globalThis so it survives dev reloads.
const store = globalThis as unknown as { klyveConfirmLimiter?: ReturnType<typeof createRateLimiter> };
const limiter = (store.klyveConfirmLimiter ??= createRateLimiter({ max: 30, windowMs: 60_000 }));

function pageUrl(token: string, notice?: ConfirmNotice): string {
  const path = `/c/${encodeURIComponent(token)}`;
  return notice ? `${path}?notice=${notice}` : path;
}

export async function confirmSubscriptionAction(formData: FormData): Promise<void> {
  const raw = formData.get("token");
  // Tokens are short; anything else is junk and fails verification anyway.
  const token = typeof raw === "string" ? raw.slice(0, 200) : "";

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
  if (!limiter.hit(`confirm:${ip || "unknown"}`).ok) redirect(pageUrl(token, "busy"));

  const result = await confirmByToken(token, { ip, userAgent: h.get("user-agent") });
  // An invalid token changes nothing; the page then shows "invalid link".
  redirect(pageUrl(token, result.ok && !result.alreadyConfirmed ? "confirmed" : undefined));
}
