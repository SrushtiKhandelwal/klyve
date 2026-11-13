import type { Metadata } from "next";
import { brandButtonStyle, PublicShell } from "@/components/public/public-shell";
import { SubmitButton } from "@/components/public/submit-button";
import { getUnsubscribeContext } from "@/lib/campaigns/unsubscribe";
import { resubscribeAction, unsubscribeAction, type UnsubscribeNotice } from "./actions";

// /u/<token>: the page the "Unsubscribe" link in every campaign email opens.
// Public: no login. The signed token identifies the one recipient.
//
// IMPORTANT: opening this page NEVER unsubscribes anyone. Link scanners
// (corporate mail security, antivirus) and prefetchers open links in emails
// automatically; if a visit unsubscribed, people would be removed without
// ever clicking. So the page asks, and the button does it.
// (Gmail/Yahoo's own one-click button uses POST /api/unsubscribe/<token>.)

export const metadata: Metadata = {
  title: "Unsubscribe",
  // Keep these pages out of search engines.
  robots: { index: false, follow: false, nocache: true },
  // The token is in the URL: never send it to other sites (logo host, links).
  referrer: "no-referrer",
};

// This page must work with JavaScript switched OFF (a legal requirement in
// spirit: anyone must be able to unsubscribe). Streaming with <Suspense>
// needs JavaScript to reveal the streamed part, so this route renders the
// whole page before responding instead. `instant = false` tells Next.js that
// waiting here is intended (see node_modules/next/dist/docs, "instant").
export const instant = false;

const NOTICES: Record<UnsubscribeNotice, string> = {
  resubscribed: "You're subscribed again. Thanks for staying!",
  "resubscribe-failed": "We couldn't resubscribe you with this link.",
  busy: "Too many attempts. Please wait a minute and try again.",
};

export default async function UnsubscribePage({ params, searchParams }: PageProps<"/u/[token]">) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const ctx = await getUnsubscribeContext(token);

  // Forged, mangled or deleted: one neutral message, no details.
  if (!ctx.ok) {
    return (
      <PublicShell>
        <h1 className="text-xl font-semibold text-zinc-900">This link is invalid or has expired</h1>
        <p className="mt-3 text-sm text-zinc-500">
          To unsubscribe, use the link at the bottom of the most recent email you received.
        </p>
      </PublicShell>
    );
  }

  const name = ctx.brand.name;
  const rawNotice = typeof query.notice === "string" ? query.notice : "";
  // Anyone can type ?notice=… into the URL, so only show "subscribed again"
  // when the database agrees; the real state always wins.
  const notice =
    Object.hasOwn(NOTICES, rawNotice) && (rawNotice !== "resubscribed" || ctx.state === "subscribed")
      ? NOTICES[rawNotice as UnsubscribeNotice]
      : null;

  return (
    <PublicShell brand={ctx.brand}>
      {notice && (
        <p role="status" className="mb-6 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
          {notice}
        </p>
      )}

      {ctx.state === "blocked" && (
        <>
          <h1 className="text-xl font-semibold break-words text-zinc-900">
            This address can&apos;t receive emails from {name}.
          </h1>
          <p className="mt-3 text-sm break-words text-zinc-500">
            {ctx.email} won&apos;t be sent any more marketing emails.
          </p>
        </>
      )}

      {ctx.state === "subscribed" && (
        <>
          <h1 className="text-xl font-semibold break-words text-zinc-900">
            Unsubscribe {ctx.email} from {name}?
          </h1>
          <p className="mt-3 text-sm text-zinc-500">
            You&apos;ll stop receiving marketing emails from {name}.
          </p>
          <form action={unsubscribeAction} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <SubmitButton pendingLabel="Unsubscribing…" style={brandButtonStyle(ctx.brand.primaryColor)}>
              Unsubscribe
            </SubmitButton>
          </form>
          {/* A softer option than leaving everything: pick lists on /p (same
              token). Only when the sender has lists people can choose from. */}
          {ctx.hasPublicLists && (
            <p className="mt-6 border-t border-zinc-100 pt-5 text-sm text-zinc-500">
              Prefer fewer emails?{" "}
              <a
                href={`/p/${encodeURIComponent(token)}`}
                className="font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900"
              >
                Choose what you receive
              </a>
            </p>
          )}
        </>
      )}

      {ctx.state === "unsubscribed" && (
        <>
          <h1 className="text-xl font-semibold text-zinc-900">You&apos;re unsubscribed</h1>
          <p className="mt-3 text-sm break-words text-zinc-500">
            You won&apos;t receive marketing emails from {name} anymore.
          </p>
          <p className="mt-1 text-xs break-words text-zinc-400">{ctx.email}</p>
          {ctx.canResubscribe && (
            <form action={resubscribeAction} className="mt-8 border-t border-zinc-100 pt-6">
              <input type="hidden" name="token" value={token} />
              <p className="mb-3 text-sm text-zinc-500">Unsubscribed by mistake?</p>
              <SubmitButton variant="outline" pendingLabel="Resubscribing…">
                Resubscribe
              </SubmitButton>
            </form>
          )}
        </>
      )}
    </PublicShell>
  );
}
