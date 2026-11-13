import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The small label + big title + intro used at the top of each landing section.
export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
  align = "center",
}: {
  /** id of the <h2>, so the <section> can point at it with aria-labelledby. */
  id: string;
  eyebrow: string;
  title: string;
  children?: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <p className="text-sm font-semibold text-emerald-700">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-3xl font-semibold tracking-tight text-balance text-zinc-900 sm:text-4xl">
        {title}
      </h2>
      {children && <p className="mt-4 text-lg leading-8 text-pretty text-zinc-600">{children}</p>}
    </div>
  );
}
