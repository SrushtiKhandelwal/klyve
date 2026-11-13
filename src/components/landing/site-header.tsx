import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/landing/brand-mark";

// Links to the sections of the landing page. They start with "/" so they
// also work from /terms and /privacy (they jump back to the home page).
const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#developers", label: "Developers" },
  { href: "/#faq", label: "FAQ" },
];

// The top bar of every public page (landing, terms, privacy).
// It's static: no login check, so these pages can be prerendered.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
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
              className="rounded-md px-3 py-2 text-sm text-zinc-600 outline-none transition-colors hover:text-zinc-900 focus-visible:ring-3 focus-visible:ring-emerald-600/40"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Base UI buttons use the `render` prop (not `asChild`) to render
              as a link. nativeButton={false} because a link isn't a <button>. */}
          <Button variant="ghost" nativeButton={false} render={<Link href="/login" />} className="h-9 px-3">
            Log in
          </Button>
          <Button
            nativeButton={false}
            render={<Link href="/signup" />}
            className="h-9 bg-emerald-600 px-3.5 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600/40"
          >
            Sign up free
          </Button>
        </div>
      </div>
    </header>
  );
}
