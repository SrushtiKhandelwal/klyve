import type { Metadata } from "next";
import { PublicShell } from "@/components/public/public-shell";

// /t/expired: where a broken tracked link lands (a mangled or forged link, a
// link from a deleted campaign, or an address that isn't a web page).
// We never send people to an address taken from the request itself, so this
// neutral page is the safe place to end up.

export const metadata: Metadata = {
  title: "Link not available",
  robots: { index: false, follow: false },
};

export default function LinkExpiredPage() {
  return (
    <PublicShell>
      <h1 className="text-xl font-semibold text-zinc-900">This link isn&apos;t available</h1>
      <p className="mt-3 text-sm text-zinc-500">
        It may have expired, or it was copied incompletely. Try clicking it again from the original email.
      </p>
    </PublicShell>
  );
}
