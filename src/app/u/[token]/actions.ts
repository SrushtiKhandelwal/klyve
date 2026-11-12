"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  clientIp,
  resubscribeByToken,
  unsubscribeByToken,
  unsubscribeRateLimiter,
} from "@/lib/campaigns/unsubscribe";

// The two buttons on the public /u/<token> page. No login: the signed token
// (sent back in a hidden field) is the only authorization, and it can only
// ever act on the one recipient it was made for (see lib/campaigns/unsubscribe.ts).
//
// Both end with a redirect back to the page, which then reads the CURRENT
// state from the database. That also works with JavaScript switched off:
// the browser submits a normal form and follows a 303 redirect.

/** Notices the page understands in ?notice=… (anything else is ignored). */
export type UnsubscribeNotice = "resubscribed" | "resubscribe-failed" | "busy";

function readToken(formData: FormData): string {
  const token = formData.get("token");
  // Tokens are short; anything else is junk and will fail verification anyway.
  return typeof token === "string" ? token.slice(0, 200) : "";
}

function pageUrl(token: string, notice?: UnsubscribeNotice): string {
  const path = `/u/${encodeURIComponent(token)}`;
  return notice ? `${path}?notice=${notice}` : path;
}

async function allowed(): Promise<boolean> {
  return unsubscribeRateLimiter.hit(`page:${clientIp(await headers())}`).ok;
}

export async function unsubscribeAction(formData: FormData): Promise<void> {
  const token = readToken(formData);
  if (!(await allowed())) redirect(pageUrl(token, "busy"));
  // An invalid token changes nothing; the page then shows "invalid link".
  await unsubscribeByToken(token);
  redirect(pageUrl(token));
}

export async function resubscribeAction(formData: FormData): Promise<void> {
  const token = readToken(formData);
  if (!(await allowed())) redirect(pageUrl(token, "busy"));
  const result = await resubscribeByToken(token);
  redirect(pageUrl(token, result.ok ? "resubscribed" : "resubscribe-failed"));
}
