import type { Metadata } from "next";
import { brandButtonStyle, PublicShell } from "@/components/public/public-shell";
import { SubmitButton } from "@/components/public/submit-button";
import {
  resubscribeAction,
  savePreferencesAction,
  unsubscribeAllAction,
  type PreferenceNotice,
} from "./actions";
import { getPreferenceContext, type PreferenceList } from "./preferences";

// /p/<token>: the subscriber preference centre, linked from campaign emails
// ({{ preferences_url }}) and from the /u unsubscribe page. Public: no login.
// The signed unsubscribe token identifies the one recipient.
//
// It lets people pick which of the sender's PUBLIC lists to stay on instead of
// leaving everything, which means fewer full unsubscribes and spam reports.
//
// IMPORTANT: opening this page NEVER changes anything (link scanners open
// links in emails automatically). Only the buttons do.

export const metadata: Metadata = {
  title: "Email preferences",
  // Keep these pages out of search engines.
  robots: { index: false, follow: false, nocache: true },
  // The token is in the URL: never send it to other sites (logo host, links).
  referrer: "no-referrer",
};

// Must work with JavaScript switched OFF, so render the whole page before
// responding instead of streaming (same as /u; see "instant" in the Next docs).
export const instant = false;

const NOTICES: Record<PreferenceNotice, string> = {
  saved: "Your preferences are saved.",
  "save-failed": "We couldn't save your choices with this link.",
  unsubscribed: "You're unsubscribed from all emails.",
  resubscribed: "You're subscribed again. Thanks for staying!",
  "resubscribe-failed": "We couldn't resubscribe you with this link.",
  busy: "Too many attempts. Please wait a minute and try again.",
};

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PreferencesPage({ params, searchParams }: Props) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const ctx = await getPreferenceContext(token);

  // Forged, mangled or deleted: one neutral message, no details.
  if (!ctx.ok) {
    return (
      <PublicShell>
        <h1 className="text-xl font-semibold text-zinc-900">This link is invalid or has expired</h1>
        <p className="mt-3 text-sm text-zinc-500">
          To change your email preferences, use the link at the bottom of the most recent email you
          received.
        </p>
      </PublicShell>
    );
  }

  const name = ctx.brand.name;
  const rawNotice = typeof query.notice === "string" ? query.notice : "";
  // Anyone can type ?notice=… into the URL, so a notice that claims a state
  // is only shown when the database agrees; the real state always wins.
  const agrees: Partial<Record<PreferenceNotice, boolean>> = {
    saved: ctx.state === "subscribed",
    unsubscribed: ctx.state === "unsubscribed",
    resubscribed: ctx.state === "subscribed",
  };
  const notice =
    Object.hasOwn(NOTICES, rawNotice) && agrees[rawNotice as PreferenceNotice] !== false
      ? (rawNotice as PreferenceNotice)
      : null;

  const ticked = ctx.lists.filter((l) => l.subscribed).length;
  // Saved with every public list unticked: that is NOT a full unsubscribe.
  const leftAllPublic = notice === "saved" && ctx.lists.length > 0 && ticked === 0;

  return (
    <PublicShell brand={ctx.brand}>
      {notice && notice !== "unsubscribed" && (
        <p role="status" className="mb-6 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
          {NOTICES[notice]}
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

      {ctx.state === "unsubscribed" && (
        <>
          <h1 className="text-xl font-semibold text-zinc-900">
            You&apos;re unsubscribed from all emails
          </h1>
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

      {ctx.state === "subscribed" && ctx.lists.length > 0 && (
        <>
          <h1 className="text-xl font-semibold break-words text-zinc-900">
            Choose the emails you get from {name}
          </h1>
          <p className="mt-2 text-sm break-words text-zinc-500">
            Tick the lists you want to stay on for {ctx.email}.
          </p>

          {leftAllPublic && (
            <LeftAllPublicNotice token={token} name={name} inPrivateLists={ctx.inPrivateLists} />
          )}

          <form action={savePreferencesAction} className="mt-6 text-left">
            <input type="hidden" name="token" value={token} />
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">Mailing lists</legend>
              {ctx.lists.map((list) => (
                <ListChoice key={list.id} list={list} color={ctx.brand.primaryColor} />
              ))}
            </fieldset>
            <div className="mt-6 text-center">
              <SubmitButton pendingLabel="Saving…" style={brandButtonStyle(ctx.brand.primaryColor)}>
                Save my choices
              </SubmitButton>
            </div>
          </form>

          {/* Kept apart from "Save" so nobody leaves everything by accident. */}
          {!leftAllPublic && (
            <form action={unsubscribeAllAction} className="mt-8 border-t border-zinc-100 pt-6">
              <input type="hidden" name="token" value={token} />
              <p className="mb-3 text-sm text-zinc-500">Don&apos;t want any emails from {name}?</p>
              <SubmitButton variant="outline" pendingLabel="Unsubscribing…">
                Unsubscribe from all emails
              </SubmitButton>
            </form>
          )}
        </>
      )}

      {/* No lists to choose from (none are public, or the contact is gone):
          just the plain unsubscribe. */}
      {ctx.state === "subscribed" && ctx.lists.length === 0 && (
        <>
          <h1 className="text-xl font-semibold break-words text-zinc-900">
            Your emails from {name}
          </h1>
          <p className="mt-3 text-sm break-words text-zinc-500">
            {ctx.email} is subscribed to marketing emails from {name}.
          </p>
          <form action={unsubscribeAllAction} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <SubmitButton pendingLabel="Unsubscribing…" style={brandButtonStyle(ctx.brand.primaryColor)}>
              Unsubscribe from all emails
            </SubmitButton>
          </form>
        </>
      )}
    </PublicShell>
  );
}

/** One public list as a big, tappable checkbox row (native input: works without JS). */
function ListChoice({ list, color }: { list: PreferenceList; color: string }) {
  const id = `list-${list.id}`;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-4 transition hover:bg-zinc-50 has-[:checked]:border-zinc-400 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-zinc-400/50"
    >
      <input
        id={id}
        type="checkbox"
        name="list"
        value={list.id}
        defaultChecked={list.subscribed}
        // The brand colour for the tick; the browser keeps it readable.
        style={{ accentColor: color }}
        className="mt-0.5 size-5 shrink-0 outline-none"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium break-words text-zinc-900">{list.name}</span>
        {list.description && (
          <span className="mt-0.5 block text-sm break-words whitespace-pre-line text-zinc-500">
            {list.description}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * Shown after saving with every list unticked. Leaving the lists above is not
 * a full unsubscribe: the person can still be on private lists, or get emails
 * sent to everyone. Say that plainly and offer the real thing right here.
 */
function LeftAllPublicNotice({
  token,
  name,
  inPrivateLists,
}: {
  token: string;
  name: string;
  inPrivateLists: boolean;
}) {
  return (
    <div role="note" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
      <p className="text-sm font-medium text-amber-900">You&apos;re still subscribed to {name}</p>
      <p className="mt-1 text-sm text-amber-800">
        {inPrivateLists
          ? `You've left all the lists below, but you're still on other mailing lists from ${name}, so you may still get those emails.`
          : `You've left all the lists below, but ${name} may still send you other emails.`}{" "}
        To stop all of them, unsubscribe from all emails.
      </p>
      <form action={unsubscribeAllAction} className="mt-4">
        <input type="hidden" name="token" value={token} />
        <SubmitButton variant="outline" pendingLabel="Unsubscribing…">
          Unsubscribe from all emails
        </SubmitButton>
      </form>
    </div>
  );
}
