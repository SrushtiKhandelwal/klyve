import Link from "next/link";
import { MailIcon } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

// The Klyve logo: an emerald square with an envelope, plus the name.
// Used by the public header, the footer and the login/sign-up pages.
export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg text-lg font-semibold tracking-tight text-zinc-900 outline-none focus-visible:ring-3 focus-visible:ring-emerald-600/40",
        className,
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm shadow-emerald-900/10">
        <MailIcon className="size-4" aria-hidden="true" />
      </span>
      {BRAND.name}
      {/* Screen readers hear "Klyve, home" instead of just "Klyve". */}
      <span className="sr-only">, home</span>
    </Link>
  );
}
