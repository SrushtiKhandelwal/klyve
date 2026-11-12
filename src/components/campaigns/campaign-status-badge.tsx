import {
  CAMPAIGN_STATUS_META,
  RECIPIENT_STATUS_META,
  type CampaignStatusValue,
  type RecipientStatusValue,
} from "@/lib/campaigns/status";
import { cn } from "@/lib/utils";

// Coloured pills for campaign and recipient statuses. The colours and labels
// come from lib/campaigns/status.ts, so every screen shows them the same way.

const pill = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset";

export function CampaignStatusBadge({ status, className }: { status: CampaignStatusValue; className?: string }) {
  const meta = CAMPAIGN_STATUS_META[status] ?? CAMPAIGN_STATUS_META.DRAFT;
  return (
    <span className={cn(pill, meta.className, className)}>
      {/* A pulsing dot while it's actually sending, so "live" is obvious at a glance. */}
      {status === "SENDING" && (
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
        </span>
      )}
      {meta.label}
    </span>
  );
}

export function RecipientStatusBadge({ status, className }: { status: RecipientStatusValue; className?: string }) {
  const meta = RECIPIENT_STATUS_META[status] ?? RECIPIENT_STATUS_META.PENDING;
  return <span className={cn(pill, meta.className, className)}>{meta.label}</span>;
}
