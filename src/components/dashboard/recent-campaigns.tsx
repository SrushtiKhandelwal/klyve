import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";
import { rowRates } from "@/components/campaigns/rates";
import { Skeleton } from "@/components/ui/skeleton";
import { CAMPAIGN_STATUS_META, type CampaignStatusValue } from "@/lib/campaigns/status";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { requireActiveWorkspace } from "@/lib/workspace";

// "Recent campaigns" on the dashboard home: the last 5 campaigns of the
// active workspace with their status and progress. Render it inside
// <Suspense> (it reads the login cookie).

const SHOWN = 5;

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const numberFormat = new Intl.NumberFormat("en-US");

type Row = {
  id: string;
  name: string;
  status: CampaignStatusValue;
  recipientCount: number;
  sentCount: number;
  createdAt: Date;
  scheduledAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  trackOpens: boolean;
  trackClicks: boolean;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  complaintCount: number;
  unsubscribeCount: number;
};

/** The most meaningful date for the campaign's state, e.g. "Sent 12 Nov 2026". */
function dateLabel(c: Row): string {
  if (c.status === "SENT" && c.finishedAt) return `Sent ${dateFormat.format(c.finishedAt)}`;
  if (c.status === "SCHEDULED" && c.scheduledAt) return `Scheduled for ${dateFormat.format(c.scheduledAt)}`;
  if (c.startedAt) return `Started ${dateFormat.format(c.startedAt)}`;
  return `Created ${dateFormat.format(c.createdAt)}`;
}

export async function RecentCampaigns() {
  // Checks login + workspace right next to the data; only THIS workspace's campaigns.
  const ws = await requireActiveWorkspace();
  const campaigns: Row[] = await db.campaign.findMany({
    where: { workspaceId: ws.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: SHOWN,
    select: {
      id: true,
      name: true,
      status: true,
      recipientCount: true,
      sentCount: true,
      createdAt: true,
      scheduledAt: true,
      startedAt: true,
      finishedAt: true,
      trackOpens: true,
      trackClicks: true,
      openCount: true,
      clickCount: true,
      bounceCount: true,
      complaintCount: true,
      unsubscribeCount: true,
    },
  });

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
        <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <Megaphone className="size-5" aria-hidden />
        </span>
        <p className="mt-3 font-medium text-zinc-900">No campaigns yet</p>
        <p className="mt-1 text-sm text-zinc-500">Your campaigns will show up here once you create one.</p>
        <Link href="/campaigns/new" className="mt-4 text-sm font-medium text-emerald-700 hover:text-emerald-800">
          Create a campaign
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-xl border bg-white shadow-xs">
      {campaigns.map((c) => {
        const meta = CAMPAIGN_STATUS_META[c.status] ?? CAMPAIGN_STATUS_META.DRAFT;
        // Drafts have no recipients yet, so a "0 / 0" would only confuse.
        const showCounts = c.status !== "DRAFT" && c.recipientCount > 0;
        // Same maths as the campaign report; "—" when not sent yet or not tracked.
        const rates = rowRates(c);
        const showRates = showCounts && c.sentCount > 0;
        return (
          <li key={c.id} className="relative flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3.5 hover:bg-zinc-50 sm:flex-nowrap">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {/* The stretched link makes the whole row clickable. */}
              <Link
                href={`/campaigns/${c.id}`}
                className="truncate font-medium text-zinc-900 after:absolute after:inset-0 hover:text-emerald-700"
              >
                {c.name}
              </Link>
              <span className="text-xs text-zinc-500">{dateLabel(c)}</span>
            </div>
            {showCounts && (
              <span className="text-sm text-zinc-600 tabular-nums">
                {numberFormat.format(c.sentCount)} / {numberFormat.format(c.recipientCount)} sent
              </span>
            )}
            {showRates && (
              <span className="flex gap-3 text-sm text-zinc-600 tabular-nums">
                <span title={rates.openTitle}>
                  <span className="font-medium text-zinc-900">{rates.open}</span> opens
                </span>
                <span title={rates.clickTitle}>
                  <span className="font-medium text-zinc-900">{rates.click}</span> clicks
                </span>
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
                meta.className,
              )}
            >
              {meta.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Same height as a few rows, so nothing jumps when the list loads. */
export function RecentCampaignsSkeleton() {
  return (
    <div className="divide-y rounded-xl border bg-white shadow-xs">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Section heading with the "View all" link. Static, so it renders immediately. */
export function RecentCampaignsHeader() {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 id="recent-campaigns" className="text-lg font-semibold text-zinc-900">
        Recent campaigns
      </h2>
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        View all
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
