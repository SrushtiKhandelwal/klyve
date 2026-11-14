import { Urbanist } from "next/font/google";
import { cn } from "@/lib/utils";

// Klyve's logo, in ONE place so every page shows exactly the same thing.
//
// The mark is the "Soft K seal": a round emerald badge with a white K (a
// straight stroke and a soft curve) and a small saffron dot between them —
// the message inside. The name is set in Urbanist ExtraBold.

const wordmarkFont = Urbanist({ subsets: ["latin"], weight: ["800"], display: "swap" });

export const LOGO_COLORS = {
  badge: "#047857", // emerald-700
  ink: "#FFFFFF",
  dot: "#F2B33D", // saffron
} as const;

/**
 * The round badge on its own. `size` is in px. Below 24 px the saffron dot
 * is left out (it would be a blur) and the strokes get a little thicker.
 */
export function KlyveMark({ size = 32, className, title }: { size?: number; className?: string; title?: string }) {
  const small = size < 24;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <circle cx="32" cy="32" r="32" fill={LOGO_COLORS.badge} />
      <g
        fill="none"
        stroke={LOGO_COLORS.ink}
        strokeWidth={small ? 6.5 : 5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M23 17V47" />
        <path d="M43 17C33 23 29 27 29 32C29 37 33 41 43 47" />
      </g>
      {!small && <circle cx="37.2" cy="32" r="3.4" fill={LOGO_COLORS.dot} />}
    </svg>
  );
}

/** The name "Klyve" in the logo's typeface. Inherits the text colour. */
export function KlyveWordmark({ className }: { className?: string }) {
  return <span className={cn(wordmarkFont.className, "font-extrabold tracking-[-0.035em]", className)}>Klyve</span>;
}
