import { SUPPRESSION_REASON_META, type SuppressionReasonValue } from "@/lib/suppression/meta";
import { cn } from "@/lib/utils";

/** Coloured pill for why an address is suppressed. */
export function SuppressionReasonBadge({ reason, className }: { reason: SuppressionReasonValue; className?: string }) {
  const meta = SUPPRESSION_REASON_META[reason];
  return (
    <span
      title={meta.description}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
