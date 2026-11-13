"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  clientIp,
  requestMeta,
  resubscribeByToken,
  unsubscribeByToken,
  unsubscribeRateLimiter,
} from "@/lib/campaigns/unsubscribe";
import { readListIds, savePreferencesByToken } from "./preferences";

// The buttons on the public /p/<token> preference centre. No login: the
// signed token (sent back in a hidden field) is the only authorization, and
// it can only ever act on the one person it was made for.
//
// Like /u, every action ends with a 303 redirect back to the page, which then
// reads the CURRENT state from the database. That works with JavaScript off:
// the browser posts a normal form and follows the redirect.

/** Notices the page understands in ?notice=… (anything else is ignored). */
export type PreferenceNotice =
  | "saved"
  | "save-failed"
  | "unsubscribed"
  | "resubscribed"
  | "resubscribe-failed"
  | "busy";

function readToken(formData: FormData): string {
  const token = formData.get("token");
  // Tokens are short; anything else is junk and will fail verification anyway.
  return typeof token === "string" ? token.slice(0, 200) : "";
}

function pageUrl(token: string, notice?: PreferenceNotice): string {
  const path = `/p/${encodeURIComponent(token)}`;
  return notice ? `${path}?notice=${notice}` : path;
}

/** The same per-IP limit as /u, so tokens can't be guessed by hammering. */
async function allowed(): Promise<boolean> {
  return unsubscribeRateLimiter.hit(`prefs:${clientIp(await headers())}`).ok;
}

/** IP + user agent for the consent record ("this came from the preference centre"). */
async function meta() {
  return requestMeta(await headers(), "preference_centre");
}

export async function savePreferencesAction(formData: FormData): Promise<void> {
  const token = readToken(formData);
  if (!(await allowed())) redirect(pageUrl(token, "busy"));
  const result = await savePreferencesByToken(token, readListIds(formData), await meta());
  redirect(pageUrl(token, result.ok ? "saved" : "save-failed"));
}

export async function unsubscribeAllAction(formData: FormData): Promise<void> {
  const token = readToken(formData);
  if (!(await allowed())) redirect(pageUrl(token, "busy"));
  // An invalid token changes nothing; the page then shows "invalid link".
  const result = await unsubscribeByToken(token, await meta());
  redirect(pageUrl(token, result.ok ? "unsubscribed" : undefined));
}

export async function resubscribeAction(formData: FormData): Promise<void> {
  const token = readToken(formData);
  if (!(await allowed())) redirect(pageUrl(token, "busy"));
  const result = await resubscribeByToken(token, await meta());
  redirect(pageUrl(token, result.ok ? "resubscribed" : "resubscribe-failed"));
}
