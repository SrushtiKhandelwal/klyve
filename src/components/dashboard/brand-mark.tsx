import Link from "next/link";
import { Mail } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Logo + product name. Links back to the dashboard home. */
export function BrandMark({ collapsible = false }: { collapsible?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
        <Mail className="size-4" />
      </span>
      <span
        className={cn(
          "truncate text-base font-semibold tracking-tight text-zinc-900",
          // In the icon-only (tablet) sidebar, keep the name for screen
          // readers but hide it visually.
          collapsible && "md:max-lg:sr-only"
        )}
      >
        {BRAND.name}
      </span>
    </Link>
  );
}
