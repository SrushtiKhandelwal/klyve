import type { Metadata } from "next";
import { brandButtonStyle, PublicShell } from "@/components/public/public-shell";
import { SubmitButton } from "@/components/public/submit-button";
import { getConfirmContext } from "@/lib/optin";
import { confirmSubscriptionAction } from "./actions";

// /c/<token>: the link in the double opt-in confirmation email.
// Public: no login. The signed token identifies the one contact.
//
// IMPORTANT: opening this page NEVER confirms anyone. Mail scanners and
// link previewers open links in emails automatically; if a visit confirmed,
// people could end up subscribed without ever clicking. So the page asks,
// and the button (a POST) does it.

export const metadata: Metadata = {
  title: "Confirm your subscription",
  // Keep these pages out of search engines.
  robots: { index: false, follow: false, nocache: true },
  // The token is in the URL: never send it to other sites (logo host, links).
  referrer: "no-referrer",
};

// Must work with JavaScript switched OFF: streaming with <Suspense> needs
// JavaScript to reveal the streamed part, so this route renders the whole
// page before responding. `instant = false` says that waiting is intended
// (see node_modules/next/dist/docs, "instant"), as on the /u page.
export const instant = false;

export default async function ConfirmPage({ params, searchParams }: PageProps<"/c/[token]">) {
  const [{ token }, query] = await Promise.all([params, searchParams]);

  // The "Send me a test" email in Settings → Compliance links here.
  if (token === "test") {
    return (
      <PublicShell>
        <h1 className="text-xl font-semibold text-zinc-900">This was a test link</h1>
        <p className="mt-3 text-sm text-zinc-500">
          In a real confirmation email, this button confirms the subscription. Nobody was subscribed.
        </p>
      </PublicShell>
    );
  }

  const notice = typeof query.notice === "string" ? query.notice : "";
  if (notice === "busy") {
    return (
      <PublicShell>
        <h1 className="text-xl font-semibold text-zinc-900">Too many attempts</h1>
        <p className="mt-3 text-sm text-zinc-500">Please wait a minute, then open the link from your email again.</p>
      </PublicShell>
    );
  }

  const ctx = await getConfirmContext(token);

  // Forged, expired, unsubscribed or blocked: one neutral message, no details.
  if (!ctx.ok) {
    return (
      <PublicShell>
        <h1 className="text-xl font-semibold text-zinc-900">This link is invalid or has expired</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Confirmation links work for 30 days. To subscribe, please sign up again.
        </p>
      </PublicShell>
    );
  }

  const name = ctx.brand.name;

  if (ctx.state === "confirmed") {
    // Anyone can type ?notice=confirmed, but we only get here when the
    // database agrees the person is subscribed, so it's always true.
    const justNow = notice === "confirmed";
    return (
      <PublicShell brand={ctx.brand}>
        <h1 className="text-xl font-semibold break-words text-zinc-900">
          {justNow ? `You're subscribed to ${name}!` : "You've already confirmed"}
        </h1>
        <p className="mt-3 text-sm break-words text-zinc-500">
          {justNow
            ? `Thanks for confirming. You'll now receive emails from ${name}.`
            : `Your subscription to ${name} is active. There's nothing more to do.`}
        </p>
        <p className="mt-1 text-xs break-words text-zinc-400">{ctx.email}</p>
      </PublicShell>
    );
  }

  return (
    <PublicShell brand={ctx.brand}>
      <h1 className="text-xl font-semibold break-words text-zinc-900">Confirm your subscription to {name}</h1>
      <p className="mt-3 text-sm break-words text-zinc-500">
        Click the button to start receiving emails from {name} at {ctx.email}.
      </p>
      <form action={confirmSubscriptionAction} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <SubmitButton pendingLabel="Confirming…" style={brandButtonStyle(ctx.brand.primaryColor)}>
          Yes, subscribe me
        </SubmitButton>
      </form>
      <p className="mt-6 text-xs text-zinc-400">
        Didn&apos;t sign up? Just close this page. You won&apos;t be subscribed.
      </p>
    </PublicShell>
  );
}
