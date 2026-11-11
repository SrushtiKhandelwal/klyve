import { CONTACT_STATUS_META, type ContactStatusValue } from "@/lib/contacts/common";
import { cn } from "@/lib/utils";

/** Small coloured label for a contact's status (Subscribed, Bounced, ...). */
export function StatusPill({ status }: { status: string }) {
  const meta = CONTACT_STATUS_META[status as ContactStatusValue];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        meta?.className ?? "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
      )}
    >
      {meta?.label ?? status}
    </span>
  );
}
