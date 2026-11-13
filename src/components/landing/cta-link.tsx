import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The landing page's call-to-action links ("Get started", "Log in", ...).
// They're links, not buttons (they go to another page or section), styled to
// look like buttons.
const VARIANTS = {
  /** Solid emerald: the main action. emerald-700 keeps white text readable. */
  primary:
    "bg-emerald-700 text-white shadow-[0_1px_2px_rgb(0_0_0/0.08),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-emerald-800",
  /** Thin outline: the second action. */
  outline: "bg-white text-zinc-900 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-50 hover:ring-zinc-400",
} as const;

const SIZES = {
  sm: "h-9 gap-1.5 rounded-lg px-3.5 text-sm",
  lg: "h-11 gap-2 rounded-lg px-5 text-[15px]",
} as const;

export function CtaLink({
  href,
  variant = "primary",
  size = "lg",
  arrow = false,
  className,
  children,
}: {
  href: string;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Show a small arrow after the text that nudges right on hover. */
  arrow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group/cta inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {children}
      {arrow && (
        <ArrowRightIcon
          aria-hidden="true"
          className="size-4 transition-transform group-hover/cta:translate-x-0.5 motion-reduce:transition-none"
        />
      )}
    </Link>
  );
}
