import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Palette, Plus, SearchX, Send, Users } from "lucide-react";
import { CampaignsFilters } from "@/components/campaigns/campaigns-filters";
import { CampaignsList } from "@/components/campaigns/campaigns-list";
import type { CampaignRowView } from "@/components/campaigns/types";
import { PageContainer } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listCampaigns } from "@/lib/campaigns/queries";
import { CAMPAIGN_STATUSES, type CampaignStatusValue } from "@/lib/campaigns/status";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Campaigns" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The page frame is static. Everything that depends on the user or the URL
// (?q=&status=) loads inside <Suspense>, so the frame shows instantly.
export default function CampaignsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageContainer>
      <Suspense fallback={<CampaignsSkeleton />}>
        <CampaignsContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** ?status=sent → "SENT"; anything unknown → no filter. */
function parseStatus(value: string): CampaignStatusValue | undefined {
  const upper = value.toUpperCase();
  return (CAMPAIGN_STATUSES as readonly string[]).includes(upper) ? (upper as CampaignStatusValue) : undefined;
}

async function CampaignsContent({ searchParams }: { searchParams: SearchParams }) {
  // Checks login + workspace right next to the data (see ../layout.tsx).
  const ws = await requireActiveWorkspace();
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 200);
  const status = parseStatus(first(sp.status));
  const filtered = Boolean(q || status);

  // Filtered by workspace inside listCampaigns: other workspaces' campaigns never appear.
  const campaigns = await listCampaigns(ws.id, { q: q || undefined, status });

  const rows: CampaignRowView[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status as CampaignStatusValue,
    subject: c.subject,
    senderLabel: c.senderLabel ?? null,
    recipientCount: c.recipientCount,
    sentCount: c.sentCount,
    failedCount: c.failedCount,
    trackOpens: c.trackOpens,
    trackClicks: c.trackClicks,
    openCount: c.openCount,
    clickCount: c.clickCount,
    bounceCount: c.bounceCount,
    complaintCount: c.complaintCount,
    unsubscribeCount: c.unsubscribeCount,
    scheduledAt: c.scheduledAt?.toISOString() ?? null,
    startedAt: c.startedAt?.toISOString() ?? null,
    finishedAt: c.finishedAt?.toISOString() ?? null,
    updatedAt: c.updatedAt.toISOString(),
  }));

  // Brand-new workspace: no list, just a friendly "how it works".
  if (!filtered && rows.length === 0) {
    return (
      <>
        <Header showButton={false} />
        <CampaignsEmpty />
      </>
    );
  }

  return (
    <>
      <Header showButton />
      <div className="flex min-w-0 flex-col gap-4">
        <CampaignsFilters q={q} status={status ?? ""} />
        {rows.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border bg-white px-6 py-12 text-center">
            <SearchX className="size-8 text-zinc-400" aria-hidden />
            <p className="mt-3 font-medium text-zinc-900">No campaigns match these filters</p>
            <p className="mt-1 text-sm text-zinc-500">Try a different search, or clear the filters.</p>
          </div>
        ) : (
          <CampaignsList rows={rows} />
        )}
      </div>
    </>
  );
}

function Header({ showButton }: { showButton: boolean }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Campaigns</h1>
        <p className="text-sm text-zinc-500 sm:text-base">One-off emails sent to your lists and segments.</p>
      </div>
      {showButton && (
        <Link href="/campaigns/new" className={buttonVariants()}>
          <Plus aria-hidden />
          Create campaign
        </Link>
      )}
    </div>
  );
}

const STEPS = [
  { icon: Users, title: "Choose who gets it", text: "Pick one or more lists or segments. Only subscribed contacts are emailed." },
  { icon: Palette, title: "Design the email", text: "Start from one of your templates, a ready-made starter, or a blank page." },
  { icon: Send, title: "Send or schedule", text: "We check everything first, then send now or at the time you choose." },
];

function CampaignsEmpty() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center sm:py-16">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <Megaphone className="size-7" aria-hidden />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-zinc-900">Send your first campaign</h2>
      <p className="mt-1.5 max-w-md text-sm text-zinc-500">
        A campaign is one email sent to many people at once, like a newsletter or a sale announcement. It goes out
        through your own email provider.
      </p>
      <ol className="mt-8 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3 rounded-xl border bg-zinc-50/60 p-4">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-900">
                <step.icon className="size-4 text-emerald-600" aria-hidden />
                {step.title}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link href="/campaigns/new" className={`${buttonVariants()} mt-8`}>
        <Plus aria-hidden />
        Create campaign
      </Link>
    </div>
  );
}

function CampaignsSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Campaigns</h1>
        <p className="text-sm text-zinc-500 sm:text-base">One-off emails sent to your lists and segments.</p>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-8 w-full sm:w-72" />
          <Skeleton className="h-8 w-full sm:w-44" />
        </div>
        <div className="flex flex-col divide-y rounded-xl border bg-white">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
              <Skeleton className="hidden h-5 w-20 rounded-full sm:block" />
              <Skeleton className="hidden h-8 w-20 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
