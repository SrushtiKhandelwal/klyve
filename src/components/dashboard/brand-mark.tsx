import Link from "next/link";
import { KlyveMark, KlyveWordmark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/** Logo (round seal + name). Links back to the dashboard home. */
export function BrandMark({ collapsible = false }: { collapsible?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className="flex min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40"
    >
      <KlyveMark size={30} />
      <KlyveWordmark
        className={cn(
          "truncate text-[1.25rem] leading-none text-zinc-900",
          // In the icon-only (tablet) sidebar, keep the name for screen
          // readers but hide it visually.
          collapsible && "md:max-lg:sr-only",
        )}
      />
    </Link>
  );
}
