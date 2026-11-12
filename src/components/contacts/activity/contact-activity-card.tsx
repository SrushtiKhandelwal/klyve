import { Skeleton } from "@/components/ui/skeleton";
import { getContactActivity, getContactEngagementSummary } from "@/lib/contacts/activity";
import { formatRate } from "@/lib/tracking/metrics";
import { toActivityPageView } from "./activity-view";
import { ContactActivityTimeline } from "./contact-activity-timeline";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * "Email activity" card: a summary strip and the timeline. The page must
 * already have checked that the contact belongs to this workspace.
 */
export async function ContactActivityCard({ workspaceId, contactId }: { workspaceId: string; contactId: string }) {
  const [summary, page] = await Promise.all([
    getContactEngagementSummary(workspaceId, contactId),
    getContactActivity(workspaceId, contactId),
  ]);
  // Same as campaign reports: rates are out of the emails that didn't bounce.
  const delivered = Math.max(0, summary.received - summary.bounced);

  return (
    <>
      <dl className="grid grid-cols-2 gap-px border-b bg-zinc-100 sm:grid-cols-4">
        <Stat label="Campaigns received" value={summary.received.toLocaleString()} />
        <Stat
          label="Opened"
          value={summary.opened.toLocaleString()}
          note={summary.received ? formatRate(summary.opened, delivered) : undefined}
        />
        <Stat
          label="Clicked"
          value={summary.clicked.toLocaleString()}
          note={summary.received ? formatRate(summary.clicked, delivered) : undefined}
        />
        <Stat
          label="Last opened"
          value={summary.lastOpenedAt ? dateFormat.format(summary.lastOpenedAt) : "Never"}
          small
        />
      </dl>
      <ContactActivityTimeline contactId={contactId} initial={toActivityPageView(page)} />
    </>
  );
}

function Stat({ label, value, note, small }: { label: string; value: string; note?: string; small?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 bg-white px-5 py-3">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-1.5">
        <span className={small ? "text-sm font-semibold text-zinc-900" : "text-lg font-semibold text-zinc-900 tabular-nums"}>
          {value}
        </span>
        {note && <span className="text-xs font-medium text-emerald-700">{note}</span>}
      </dd>
    </div>
  );
}

export function ContactActivityCardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-px border-b bg-zinc-100 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white px-5 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-5 w-12" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-7 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="mt-1.5 h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
