import Link from "next/link";
import { BrandMark } from "@/components/landing/brand-mark";
import { CtaLink } from "@/components/landing/cta-link";

// Links to the sections of the landing page. They start with "/" so they
// also work from /terms and /privacy (they jump back to the home page).
const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#developers", label: "Developers" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

// The top bar of every public page (landing, terms, privacy). It stays at the
// top while you scroll. It's static: no login check, so these pages can be
// prerendered.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white">
      {/* Keyboard users can jump straight past the navigation. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <BrandMark />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-zinc-600 transition-colors outline-none hover:text-zinc-950 focus-visible:ring-3 focus-visible:ring-emerald-600/40"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/login"
            className="rounded-md px-3 py-2 text-sm font-medium text-zinc-700 transition-colors outline-none hover:text-zinc-950 focus-visible:ring-3 focus-visible:ring-emerald-600/40"
          >
            Log in
          </Link>
          <CtaLink href="/signup" size="sm">
            Get started
          </CtaLink>
        </div>
      </div>
    </header>
  );
}
