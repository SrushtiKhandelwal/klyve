import { TRANSACTIONAL_STATUS_META } from "@/components/transactional/status";
import type { TransactionalStatusName } from "@/lib/transactional/schema";
import { cn } from "@/lib/utils";

// Coloured pill for a transactional email's status (colours in status.ts).
export function TransactionalStatusBadge({ status, className }: { status: TransactionalStatusName; className?: string }) {
  const meta = TRANSACTIONAL_STATUS_META[status] ?? TRANSACTIONAL_STATUS_META.QUEUED;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        meta.className,
        className,
      )}
    >
      {/* A pulsing dot while it's on its way, so "in progress" is obvious at a glance. */}
      {(status === "QUEUED" || status === "SENDING") && (
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {meta.label}
    </span>
  );
}
