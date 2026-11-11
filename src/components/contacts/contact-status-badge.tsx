import { CONTACT_STATUS_META, type ContactStatusValue } from "@/lib/contacts/common";
import { cn } from "@/lib/utils";

/** Coloured pill for a contact's status. Same look on every screen. */
export function ContactStatusBadge({
  status,
  className,
}: {
  status: ContactStatusValue;
  className?: string;
}) {
  const meta = CONTACT_STATUS_META[status];
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
