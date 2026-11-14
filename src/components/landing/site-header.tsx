import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { BrandMark } from "@/components/landing/brand-mark";
import { DesktopNav, HeaderShell, MobileNav } from "@/components/landing/site-nav";

// The top bar of every public page (landing, terms, privacy). It stays at the
// top while you scroll (HeaderShell turns it white with a soft shadow then).
// No login check here, so these pages can be prerendered.
export function SiteHeader() {
  return (
    <>
      {/* Keyboard users can jump straight past the navigation. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow"
      >
        Skip to content
      </a>

      <HeaderShell>
        <BrandMark />

        <DesktopNav />

        <div className="flex items-center justify-end gap-1.5 sm:gap-2">
          <Link
            href="/login"
            className="hidden h-10 items-center rounded-xl px-3.5 text-[14.5px] font-medium text-zinc-700 outline-none transition-colors hover:bg-[#F6F2EA] hover:text-zinc-950 focus-visible:ring-3 focus-visible:ring-emerald-600/40 sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="group/cta inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#10201B] px-3.5 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(16_32_27/0.3)] outline-none transition-colors hover:bg-[#1D3A31] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:px-4 sm:text-[14.5px]"
          >
            Get started
            <ArrowRightIcon
              aria-hidden="true"
              className="hidden size-4 transition-transform group-hover/cta:translate-x-0.5 motion-reduce:transition-none sm:block"
            />
          </Link>
          <MobileNav />
        </div>
      </HeaderShell>
    </>
  );
}
