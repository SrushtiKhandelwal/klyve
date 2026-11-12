import type { NextRequest } from "next/server";
import { handleProviderWebhook } from "@/lib/webhooks/handle";

// Where email providers (Amazon SES via SNS, Resend, SendGrid, Mailgun,
// Postmark) report deliveries, bounces and spam complaints.
// All the logic and security checks live in src/lib/webhooks/handle.ts.
//
// No login and no CSRF check here on purpose: these are server-to-server
// POSTs from the providers. The secret token in the URL plus the provider's
// signature are the authorization.

export async function POST(request: NextRequest, ctx: RouteContext<"/api/webhooks/[providerId]/[token]">) {
  const { providerId, token } = await ctx.params;
  try {
    return await handleProviderWebhook(request, providerId, token);
  } catch (err) {
    // Usually a database hiccup. 500 makes the provider retry later, so nothing is lost.
    console.error("[webhooks] failed to process a webhook:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Temporary problem, please retry" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
