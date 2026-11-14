import Link from "next/link";
import { KlyveMark, KlyveWordmark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

// The Klyve logo (round seal + name), linking to the home page.
// Used by the public header, the footer, the login/sign-up pages and invites.
export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg text-[1.35rem] leading-none text-zinc-900 outline-none focus-visible:ring-3 focus-visible:ring-emerald-600/40",
        className,
      )}
    >
      <KlyveMark size={32} />
      <KlyveWordmark />
      {/* Screen readers hear "Klyve, home" instead of just "Klyve". */}
      <span className="sr-only">, home</span>
    </Link>
  );
}
