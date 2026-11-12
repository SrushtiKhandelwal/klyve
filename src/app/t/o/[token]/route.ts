import { after, type NextRequest } from "next/server";
import { clientIp } from "@/lib/campaigns/unsubscribe";
import { verifyRecipientToken } from "@/lib/campaigns/tokens";
import { classifyOpen } from "@/lib/tracking/bots";
import { TRANSPARENT_GIF_BASE64 } from "@/lib/tracking/links";
import { recordEvent } from "@/lib/tracking/record";

// GET /t/o/<token>.gif: the open-tracking "pixel" (a 1×1 invisible image in
// every tracked email). Loading it means the email was (probably) opened.
//
// RULES
//  - ALWAYS answer with the image, straight away, even for a bad token:
//    a broken image icon in someone's email would look bad, and an error
//    would tell a token-guesser which tokens are real.
//  - The open is recorded AFTER the response is sent (Next.js `after()`),
//    so the image never waits for the database.
//  - Never cached anywhere (each load is a new open), and no cookies.
//  - HEAD requests get the same headers but are not counted (nothing was
//    displayed to anyone).

const GIF = new Uint8Array(Buffer.from(TRANSPARENT_GIF_BASE64, "base64"));

const HEADERS = {
  "Content-Type": "image/gif",
  "Content-Length": String(GIF.byteLength),
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Expires: "0",
  Pragma: "no-cache",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

type Context = { params: Promise<{ token: string }> };

function gif(withBody: boolean): Response {
  return new Response(withBody ? GIF : null, { status: 200, headers: HEADERS });
}

export async function GET(request: NextRequest, ctx: Context) {
  const { token } = await ctx.params;
  // The email uses /t/o/<token>.gif (some email apps like image URLs to look like images).
  const recipientId = verifyRecipientToken(token.replace(/\.gif$/i, ""), "track");

  if (recipientId) {
    // Read what we need now: the request isn't available after the response.
    const userAgent = request.headers.get("user-agent") ?? "";
    const ip = clientIp(request.headers);
    after(async () => {
      try {
        const verdict = classifyOpen(userAgent, ip);
        await recordEvent({
          recipientId,
          type: "OPENED",
          isBot: verdict.isBot,
          userAgent,
          ip,
          detail: verdict.reason ? { botReason: verdict.reason } : undefined,
        });
      } catch (error) {
        // Losing one open is fine; breaking anything because of it is not.
        console.error("[tracking] couldn't record an open:", error);
      }
    });
  }
  return gif(true);
}

export function HEAD() {
  return gif(false);
}
