import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenIcon, CodeIcon, InboxIcon, KeyRoundIcon, SearchX, SendIcon, TagIcon } from "lucide-react";
import { PageContainer } from "@/components/dashboard/page-header";
import { DailyChart } from "@/components/transactional/daily-chart";
import { EmailLogList } from "@/components/transactional/email-log-list";
import { filtersToSearch, hasFilters, parseLogFilters } from "@/components/transactional/filters";
import { LogFiltersBar } from "@/components/transactional/log-filters";
import { SendTestDialog } from "@/components/transactional/send-test-dialog";
import type { TestSendOptions } from "@/components/transactional/types";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getVerifiedSenders } from "@/lib/email/senders";
import { getCurrentUser } from "@/lib/session";
import { listTemplates } from "@/lib/templates/queries";
import { getTransactionalStats, type TransactionalStats } from "@/lib/transactional/queries";
import { requireActiveWorkspace } from "@/lib/workspace";
import { listKeyChoices, loadEmailRows } from "./data";

export const metadata: Metadata = { title: "Transactional" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATS_DAYS = 7;

// Transactional logs: every email sent through the API (and dashboard tests).
// The frame is static; everything that depends on the user or the URL filters
// loads inside <Suspense>.
export default function TransactionalPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageContainer>
      <Suspense fallback={<LogsSkeleton />}>
        <TransactionalContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function TransactionalContent({ searchParams }: { searchParams: SearchParams }) {
  const ws = await requireActiveWorkspace();
  const filters = parseLogFilters(await searchParams);

  // Every query is filtered by this workspace: other workspaces' emails never appear.
  const [stats, page, keys, senders, templates, user] = await Promise.all([
    getTransactionalStats(ws.id, { days: STATS_DAYS }),
    loadEmailRows(ws.id, filters, null),
    listKeyChoices(ws.id),
    getVerifiedSenders(ws.id),
    listTemplates(ws.id, { sort: "name" }),
    getCurrentUser(),
  ]);

  const testOptions: TestSendOptions = {
    senders: senders.map((s) => ({ id: s.id, label: `${s.name} <${s.email}>` })),
    templates: templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject })),
    defaultTo: user?.email ?? "",
  };

  // Brand-new: nothing sent yet and no filters → a friendly "how to start".
  if (!hasFilters(filters) && page.rows.length === 0) {
    return (
      <>
        <Header testOptions={testOptions} showTest={false} />
        <TransactionalEmpty testOptions={testOptions} />
      </>
    );
  }

  return (
    <>
      <Header testOptions={testOptions} showTest />
      <StatsPanel stats={stats} />
      <div className="flex min-w-0 flex-col gap-4">
        <LogFiltersBar filters={filters} keys={keys.map((k) => ({ id: k.id, name: k.name, revoked: k.revokedAt !== null }))} />
        {page.rows.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border bg-white px-6 py-12 text-center">
            <SearchX className="size-8 text-zinc-400" aria-hidden />
            <p className="mt-3 font-medium text-zinc-900">No emails match these filters</p>
            <p className="mt-1 text-sm text-zinc-500">
              The recipient search needs the full address. Try another filter, or clear them.
            </p>
          </div>
        ) : (
          // A new key per filter set: the list starts over from page one.
          <EmailLogList key={filtersToSearch(filters)} initialRows={page.rows} initialCursor={page.nextCursor} filters={filters} />
        )}
      </div>
    </>
  );
}

function Header({ testOptions, showTest }: { testOptions: TestSendOptions; showTest: boolean }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Transactional</h1>
        <p className="text-sm text-zinc-500 sm:text-base">
          One-to-one emails your app sends through the API, like receipts and password resets.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/docs/api" className={buttonVariants({ variant: "outline" })}>
          <BookOpenIcon aria-hidden />
          API docs
        </Link>
        {showTest && <SendTestDialog options={testOptions} />}
      </div>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("en");

function StatsPanel({ stats }: { stats: TransactionalStats }) {
  const s = stats.byStatus;
  const waiting = s.QUEUED + s.SENDING;
  const cards = [
    { label: "Sent", value: s.SENT, tone: "text-emerald-700", hint: waiting ? `${fmt(waiting)} on the way` : "Accepted by your provider" },
    { label: "Failed", value: s.FAILED, tone: s.FAILED ? "text-red-600" : "text-zinc-900", hint: "Couldn't be sent" },
    { label: "Suppressed", value: s.SUPPRESSED, tone: s.SUPPRESSED ? "text-violet-700" : "text-zinc-900", hint: "Blocked addresses" },
    {
      label: "Bounced",
      value: s.BOUNCED,
      tone: s.BOUNCED ? "text-orange-700" : "text-zinc-900",
      hint: s.COMPLAINED ? `+ ${fmt(s.COMPLAINED)} spam complaint${s.COMPLAINED === 1 ? "" : "s"}` : "Rejected by the inbox",
    },
  ];

  return (
    <section aria-labelledby="stats-title" className="flex flex-col gap-4 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="stats-title" className="font-semibold text-zinc-900">
          Last {stats.days} days
        </h2>
        <p className="text-sm text-zinc-500">
          {fmt(stats.total)} email{stats.total === 1 ? "" : "s"} in total
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-zinc-50/60 px-4 py-3">
            <dt className="text-xs font-medium text-zinc-500">{c.label}</dt>
            <dd className={`mt-1 text-2xl font-semibold tabular-nums ${c.tone}`}>{fmt(c.value)}</dd>
            <dd className="mt-0.5 truncate text-xs text-zinc-500">{c.hint}</dd>
          </div>
        ))}
      </dl>
      <DailyChart daily={stats.daily} />
      {stats.topTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-4">
          <span className="mr-1 flex items-center gap-1 text-xs font-medium text-zinc-500">
            <TagIcon className="size-3.5" aria-hidden />
            Top tags
          </span>
          {stats.topTags.map((t) => (
            <Link
              key={t.tag}
              href={`/transactional?tag=${encodeURIComponent(t.tag)}`}
              className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              {t.tag} <span className="text-zinc-400">{fmt(t.count)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

const STEPS = [
  { icon: KeyRoundIcon, title: "Create an API key", text: "In Settings → API keys. Keep it on your server, never in website code." },
  { icon: CodeIcon, title: "Copy the curl example", text: "The docs have it ready in cURL, Node.js, Python and PHP. Run it once." },
  { icon: InboxIcon, title: "See it here", text: "Every email shows up in this list with its status and full content." },
];

function TransactionalEmpty({ testOptions }: { testOptions: TestSendOptions }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center sm:py-16">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <SendIcon className="size-7" aria-hidden />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-zinc-900">Send your first email with the API</h2>
      <p className="mt-1.5 max-w-md text-sm text-zinc-500">
        Receipts, password resets and order updates, sent from your own app through your own provider, in three steps.
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
      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Link href="/settings/api" className={buttonVariants()}>
          <KeyRoundIcon aria-hidden />
          Create an API key
        </Link>
        <Link href="/docs/api#quick-start" className={buttonVariants({ variant: "outline" })}>
          <BookOpenIcon aria-hidden />
          Read the quick start
        </Link>
        <SendTestDialog options={testOptions} variant="outline" />
      </div>
    </div>
  );
}

function LogsSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Transactional</h1>
        <p className="text-sm text-zinc-500 sm:text-base">
          One-to-one emails your app sends through the API, like receipts and password resets.
        </p>
      </div>
      <div className="rounded-xl border bg-white p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="mt-4 h-32" />
      </div>
      <div className="flex flex-col divide-y rounded-xl border bg-white">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <Skeleton className="hidden h-5 w-20 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </>
  );
}
