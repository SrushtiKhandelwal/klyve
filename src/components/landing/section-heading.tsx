import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The small label + big title + intro at the top of each landing section.
// The label is plain text after a short emerald hairline (no pill or badge).
export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
  align = "left",
  className,
}: {
  /** id of the <h2>, so the <section> can point at it with aria-labelledby. */
  id: string;
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      <p
        className={cn(
          "flex items-center gap-3 text-sm font-medium text-emerald-700",
          align === "center" && "justify-center",
        )}
      >
        <span aria-hidden="true" className="h-px w-6 bg-emerald-600" />
        {eyebrow}
      </p>
      <h2
        id={id}
        className="mt-4 text-[2rem] leading-[1.08] font-semibold tracking-[-0.035em] text-balance text-zinc-950 sm:text-5xl"
      >
        {title}
      </h2>
      {children && <p className="mt-5 text-lg leading-8 text-pretty text-zinc-600">{children}</p>}
    </div>
  );
}
