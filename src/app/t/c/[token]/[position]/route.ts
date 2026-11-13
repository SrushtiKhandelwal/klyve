import { after, type NextRequest } from "next/server";
import { absoluteUrl } from "@/lib/app-url";
import { clientIp } from "@/lib/campaigns/unsubscribe";
import { createRecipientToken, verifyRecipientToken } from "@/lib/campaigns/tokens";
import { db } from "@/lib/db";
import { buildMergeData } from "@/lib/templates/personalize";
import { classifyClick } from "@/lib/tracking/bots";
import { personalizeLink, trackingUrls } from "@/lib/tracking/links";
import { recordEvent } from "@/lib/tracking/record";

// GET /t/c/<token>/<position>: a tracked link. Counts the click, then sends
// the person on to the real address (302 redirect).
//
// SAFETY
//  - The destination comes ONLY from our database (the CampaignLink saved at
//    launch), filled with this recipient's details, and must be http(s).
//    Nothing in the request can choose where we redirect, so this can't be
//    used as an "open redirect" for phishing.
//  - The token is signed: a forged or edited one gets the neutral
//    /t/expired page, never an error and never a hint.
//  - Referrer-Policy: no-referrer, so the destination site doesn't see this
//    URL (which contains the person's token).
//
// HEAD requests (sent by link scanners and previewers to check a link) get
// the same redirect but are NOT recorded as clicks: a person clicking a
// link always makes a GET request.

const HEADERS = {
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
  "Cache-Control": "no-store, private",
};

type Context = { params: Promise<{ token: string; position: string }> };

function redirectTo(url: string): Response {
  return new Response(null, { status: 302, headers: { ...HEADERS, Location: url } });
}

/** Where broken links go. Always our own page, never an address from the request. */
const fallback = () => redirectTo(absoluteUrl("/t/expired"));

async function handle(request: NextRequest, ctx: Context, countClick: boolean): Promise<Response> {
  const { token, position } = await ctx.params;
  const recipientId = verifyRecipientToken(token, "track");
  if (!recipientId || !/^\d{1,6}$/.test(position)) return fallback();

  try {
    const recipient = await db.campaignRecipient.findUnique({
      where: { id: recipientId },
      select: {
        id: true,
        email: true,
        sentAt: true,
        contact: { select: { workspaceId: true, email: true, firstName: true, lastName: true, attributes: true } },
        campaign: {
          select: {
            workspaceId: true,
            workspace: { select: { name: true } },
            // The link at this position IN THIS RECIPIENT'S CAMPAIGN only.
            links: { where: { position: Number(position) }, select: { id: true, url: true }, take: 1 },
          },
        },
      },
    });
    const link = recipient?.campaign.links[0];
    if (!recipient || !link) return fallback();

    // Fill merge tags in the link (e.g. ?email={{ contact.EMAIL }}) with the
    // contact's CURRENT details, like the view-in-browser page does.
    const { campaign } = recipient;
    const contact =
      recipient.contact && recipient.contact.workspaceId === campaign.workspaceId
        ? recipient.contact
        : { email: recipient.email, firstName: null, lastName: null, attributes: {} };
    const data = {
      ...buildMergeData(contact, {
        unsubscribeUrl: absoluteUrl(`/u/${createRecipientToken(recipient.id, "unsubscribe")}`),
        viewInBrowserUrl: absoluteUrl(`/v/${createRecipientToken(recipient.id, "view")}`),
        preferencesUrl: absoluteUrl(`/p/${createRecipientToken(recipient.id, "unsubscribe")}`),
        workspaceName: campaign.workspace.name,
      }),
      tracking: trackingUrls(recipient.id),
    };
    const destination = personalizeLink(link.url, data);

    if (countClick) {
      const userAgent = request.headers.get("user-agent") ?? "";
      const ip = clientIp(request.headers);
      const sentAt = recipient.sentAt;
      after(async () => {
        try {
          const verdict = classifyClick(userAgent, ip, sentAt);
          await recordEvent({
            recipientId: recipient.id,
            type: "CLICKED",
            linkId: link.id,
            isBot: verdict.isBot,
            userAgent,
            ip,
            detail: verdict.reason ? { botReason: verdict.reason } : undefined,
          });
        } catch (error) {
          console.error("[tracking] couldn't record a click:", error);
        }
      });
    }

    // Not a web address after personalizing (e.g. a contact's "website"
    // field holds "javascript:…"): the safe page instead.
    return destination ? redirectTo(destination) : fallback();
  } catch (error) {
    // Database trouble: the person must still end up somewhere sensible.
    console.error("[tracking] click redirect failed:", error);
    return fallback();
  }
}

export function GET(request: NextRequest, ctx: Context) {
  return handle(request, ctx, true);
}

export function HEAD(request: NextRequest, ctx: Context) {
  return handle(request, ctx, false);
}
