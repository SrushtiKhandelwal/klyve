import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

// The frame for PUBLIC pages that email recipients see (unsubscribe, etc.).
// It carries the SENDER's brand (their logo or name and colour), not Klyve's
// dashboard look: the person on this page knows the sender, not us.
// Works on phones: one narrow column with comfortable padding.

export type PublicBrand = {
  /** Company name from the brand kit (falls back to the workspace name). */
  name: string;
  logoUrl: string | null;
  /** A validated hex colour, e.g. "#059669". */
  primaryColor: string;
};

/** Neutral look for pages where we don't know (or won't reveal) the sender. */
const NEUTRAL_COLOR = "#52525b";

/**
 * Black or white, whichever is easier to read on `hex`. A brand colour can be
 * anything (pale yellow, near black…), so text on it must adapt.
 */
export function readableTextColor(hex: string): "#ffffff" | "#18181b" {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const full = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  // Relative luminance (WCAG formula): above ~0.5 the colour is "light".
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? "#18181b" : "#ffffff";
}

/** Inline style for a solid button in the brand colour. */
export function brandButtonStyle(color: string): CSSProperties {
  return { backgroundColor: color, color: readableTextColor(color) };
}

export function PublicShell({ brand, children }: { brand?: PublicBrand | null; children: ReactNode }) {
  const accent = brand?.primaryColor ?? NEUTRAL_COLOR;
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 sm:py-16">
      <div className="flex w-full max-w-md flex-1 flex-col">
        {brand && (
          <header className="mb-6 flex justify-center">
            {brand.logoUrl ? (
              // A plain <img>: the logo can live on any https host (or /media),
              // and no-referrer keeps the token in this page's URL private.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logoUrl}
                alt={brand.name}
                referrerPolicy="no-referrer"
                className="max-h-14 max-w-[220px] object-contain"
              />
            ) : (
              <span className="text-center text-xl font-semibold tracking-tight break-words text-zinc-900">
                {brand.name}
              </span>
            )}
          </header>
        )}

        <main
          className="rounded-2xl border-t-4 bg-white px-6 py-8 text-center shadow-sm ring-1 ring-zinc-900/5 sm:px-8"
          style={{ borderTopColor: accent }}
        >
          {children}
        </main>

        <footer className="mt-auto pt-10 text-center text-xs text-zinc-400">
          Powered by{" "}
          <Link href="/" prefetch={false} className="font-medium text-zinc-500 hover:text-zinc-700">
            {BRAND.name}
          </Link>
        </footer>
      </div>
    </div>
  );
}
