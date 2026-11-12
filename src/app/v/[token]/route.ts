import type { NextRequest } from "next/server";
import { absoluteUrl } from "@/lib/app-url";
import { createRecipientToken, verifyRecipientToken } from "@/lib/campaigns/tokens";
import { clientIp, unsubscribeRateLimiter } from "@/lib/campaigns/unsubscribe";
import { db } from "@/lib/db";
import { buildMergeData, personalize, type MergeData } from "@/lib/templates/personalize";

// GET /v/<token>: "View in browser". Shows the campaign email exactly as this
// recipient got it (their name, their own unsubscribe link).
//
// It's a Route Handler returning the email's own full HTML document, rather
// than a React page: an email is a complete <html> page with its own styles,
// and must not be mixed with the app's layout and scripts.
//
// SAFETY: the HTML was sanitized when the template was rendered, and contact
// values are escaped by personalize(). On top of that, a strict
// Content-Security-Policy makes the browser refuse to run ANY script, and
// "sandbox" gives the page a throwaway origin, so even a mistake in the email
// HTML could never reach the app's cookies.

const CSP = [
  "default-src 'none'",
  "script-src 'none'",
  // Emails use inline styles everywhere (and MJML may link web fonts).
  "style-src 'unsafe-inline' https:",
  "img-src 'self' https: data:",
  "font-src https: data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  // No scripts, no forms, no same-origin access. Links still work (opened in
  // the same tab, or a new one for target="_blank").
  "sandbox allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation",
].join("; ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  // The token is in the URL: links clicked in the email mustn't leak it.
  "Referrer-Policy": "no-referrer",
  // Personal content: never store it in shared caches.
  "Cache-Control": "private, no-store",
};

function textResponse(status: number, body: string, extra: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extra },
  });
}

export async function GET(request: NextRequest, ctx: RouteContext<"/v/[token]">) {
  const limit = unsubscribeRateLimiter.hit(`view:${clientIp(request.headers)}`);
  if (!limit.ok) {
    return textResponse(429, "Too many requests. Please try again shortly.", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const { token } = await ctx.params;
  // A "view" token only: an unsubscribe token (or a forged one) doesn't work here.
  const recipientId = verifyRecipientToken(token, "view");
  if (!recipientId) return textResponse(404, "Not found");

  const recipient = await db.campaignRecipient.findUnique({
    where: { id: recipientId },
    select: {
      id: true,
      email: true,
      status: true,
      contact: { select: { workspaceId: true, email: true, firstName: true, lastName: true, attributes: true } },
      campaign: {
        select: {
          workspaceId: true,
          html: true,
          subject: true,
          workspace: { select: { name: true } },
        },
      },
    },
  });
  // Only emails that were really sent can be viewed. A queued or failed one
  // was never in anyone's inbox, so its link shouldn't exist yet.
  if (!recipient || recipient.status !== "SENT" || !recipient.campaign.html) {
    return textResponse(404, "Not found");
  }
  const { campaign } = recipient;

  // The contact's CURRENT details (same as the worker uses). If the contact
  // was deleted, only the email address we kept at send time is known.
  const contact =
    recipient.contact && recipient.contact.workspaceId === campaign.workspaceId
      ? recipient.contact
      : { email: recipient.email, firstName: null, lastName: null, attributes: {} };

  const data: MergeData & { view_in_browser_url: string } = {
    ...buildMergeData(contact, {
      unsubscribeUrl: absoluteUrl(`/u/${createRecipientToken(recipient.id, "unsubscribe")}`),
      workspaceName: campaign.workspace.name,
    }),
    view_in_browser_url: absoluteUrl(`/v/${token}`),
  };

  let html: string;
  try {
    html = personalize({ html: campaign.html, text: "", subject: campaign.subject }, data).html;
  } catch (err) {
    // A broken merge tag can't normally get past the pre-send checks.
    console.error("[view-in-browser] personalize failed", err);
    return textResponse(500, "This email can't be displayed right now.");
  }

  return new Response(html, {
    status: 200,
    headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}
