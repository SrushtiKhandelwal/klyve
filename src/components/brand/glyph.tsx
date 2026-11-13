import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Klyve's icon style (used on the landing page AND inside the app).
//
// Icons are drawn "bare": no rounded square or circle behind them. Their lines
// are painted with Klyve's emerald→teal gradient instead of one flat colour,
// which is what makes them feel like ours rather than a generic icon set.
//
// How it works: <GlyphGradientDefs /> (rendered once in the root layout)
// defines an SVG gradient with a fixed id. Every <Glyph> points its stroke at
// that id. userSpaceOnUse (0→24, the icons' own grid) keeps perfectly straight
// lines visible — objectBoundingBox would make them disappear.

export const GLYPH_GRADIENT_ID = "klyve-glyph-gradient";
export const GLYPH_GRADIENT_SOFT_ID = "klyve-glyph-gradient-soft";

export function GlyphGradientDefs() {
  return (
    <svg aria-hidden width="0" height="0" focusable="false" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <defs>
        <linearGradient id={GLYPH_GRADIENT_ID} gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="22" y2="22">
          <stop offset="0%" stopColor="#34d399" /> {/* emerald-400 */}
          <stop offset="55%" stopColor="#059669" /> {/* emerald-600 */}
          <stop offset="100%" stopColor="#0f766e" /> {/* teal-700 */}
        </linearGradient>
        {/* Lighter version for dark backgrounds. */}
        <linearGradient id={GLYPH_GRADIENT_SOFT_ID} gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="22" y2="22">
          <stop offset="0%" stopColor="#a7f3d0" /> {/* emerald-200 */}
          <stop offset="60%" stopColor="#34d399" /> {/* emerald-400 */}
          <stop offset="100%" stopColor="#2dd4bf" /> {/* teal-400 */}
        </linearGradient>
      </defs>
    </svg>
  );
}

const SIZES = { xs: "size-3.5", sm: "size-4", md: "size-5", lg: "size-6", xl: "size-8" } as const;

/**
 * A bare gradient icon. `tone`:
 * - "brand" (default): the emerald gradient, for light backgrounds
 * - "soft": the lighter gradient, for dark backgrounds
 * - "muted": plain zinc, for quiet places (tables, secondary text)
 * - "current": inherits the text colour (e.g. inside buttons)
 */
export function Glyph({
  icon: Icon,
  size = "md",
  tone = "brand",
  strokeWidth = 1.75,
  className,
}: {
  icon: LucideIcon;
  size?: keyof typeof SIZES;
  tone?: "brand" | "soft" | "muted" | "current";
  strokeWidth?: number;
  className?: string;
}) {
  const color =
    tone === "brand" ? `url(#${GLYPH_GRADIENT_ID})` : tone === "soft" ? `url(#${GLYPH_GRADIENT_SOFT_ID})` : "currentColor";
  return (
    <Icon
      aria-hidden
      color={color}
      strokeWidth={strokeWidth}
      className={cn("shrink-0", SIZES[size], tone === "muted" && "text-zinc-400", className)}
    />
  );
}
