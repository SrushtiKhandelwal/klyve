"use client";

import { useSyncExternalStore, type ReactNode } from "react";

// Shows the contact address as a mailto: link, but only in the browser.
//
// The server only sends a scrambled version (`code`: the address reversed,
// then base64). The page's HTML therefore never contains a plain address for
// spam bots to collect; real visitors see it a moment after the page loads.
// Until then `fallback` is shown (e.g. "Email us").

// "Are we in the browser yet?" without setState-in-effect: false while the
// server renders (and during hydration), true once running in the browser.
const noSubscribe = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

function decode(code: string): string {
  const bytes = Uint8Array.from(atob(code), (c) => c.charCodeAt(0));
  return [...new TextDecoder().decode(bytes)].reverse().join("");
}

export function ContactEmailLink({
  code,
  before,
  after,
  fallback = null,
  className,
}: {
  code: string;
  /** Text shown just before the link (once it's visible). */
  before?: string;
  /** Text shown just after the link (once it's visible). */
  after?: string;
  /** Shown until the address is ready. */
  fallback?: ReactNode;
  className?: string;
}) {
  const isClient = useIsClient();
  if (!isClient) return <>{fallback}</>;

  const email = decode(code);
  return (
    <>
      {before}
      <a href={`mailto:${email}`} className={className}>
        {email}
      </a>
      {after}
    </>
  );
}
