import type { LucideIcon } from "lucide-react";

/**
 * The "nothing here yet" box used by sections we haven't built yet.
 * Keeps all placeholder pages looking the same.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  phase,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Which build phase this feature arrives in, e.g. 1 → "Coming in Phase 1". */
  phase: number;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center sm:py-20">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <Icon className="size-7" />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-zinc-900">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-zinc-500">{description}</p>
      <span className="mt-5 inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
        Coming in Phase {phase}
      </span>
    </div>
  );
}
