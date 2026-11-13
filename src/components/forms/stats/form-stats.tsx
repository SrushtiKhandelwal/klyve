import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, Globe, Inbox, Share2, ShieldBan, UserCheck, UserPlus, Users } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { RelativeTime } from "@/components/campaigns/local-time";
import { formatCount } from "@/components/campaigns/types";
import { RESULT_META } from "@/components/forms/stats/result-meta";
import { SignupsChart } from "@/components/forms/stats/signups-chart";
import { getFormStats, type FormStats as Stats } from "@/lib/forms/stats";
import { requireActiveWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";

// A form's Statistics: sign-up cards, a daily chart, where sign-ups came
// from, and the latest submissions.
//
// An async Server Component: it reads the session (to find the workspace),
// so the page must render it inside <Suspense>. The data never leaves the
// server except as finished HTML, and email addresses are masked anyway so
// the page is safe to screen-share.

const DAYS = 30;

export async function FormStats({ formId }: { formId: string }) {
  const ws = await requireActiveWorkspace();
  const stats = await getFormStats(ws, formId, { days: DAYS });

  if (!stats) {
    return <p className="rounded-xl border bg-white p-5 text-sm text-zinc-500">This form doesn&apos;t exist (or was deleted).</p>;
  }

  // Nothing ever submitted: one friendly box instead of a wall of zeros.
  if (stats.allTimeSignups === 0 && stats.recent.length === 0) return <EmptyState />;

  return (
    <section aria-labelledby="form-stats-title" className="flex flex-col gap-4">
      <div>
        <h2 id="form-stats-title" className="font-semibold text-zinc-900">
          Statistics
        </h2>
        <p className="text-sm text-zinc-500">Last {DAYS} days. Days are counted in UTC.</p>
      </div>

      <StatCards stats={stats} />

      <Panel title="Sign-ups per day" icon={<BarChart3 aria-hidden className="size-4 text-zinc-400" />}>
        <SignupsChart daily={stats.daily} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Where sign-ups come from" icon={<Globe aria-hidden className="size-4 text-zinc-400" />}>
          <TopSources stats={stats} />
        </Panel>
        <Panel title="What happened" icon={<Users aria-hidden className="size-4 text-zinc-400" />}>
          <Outcomes stats={stats} />
        </Panel>
      </div>

      <Panel title="Latest submissions" icon={<Inbox aria-hidden className="size-4 text-zinc-400" />}>
        <RecentSubmissions stats={stats} />
      </Panel>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-col items-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
      <Glyph icon={Share2} size="xl" strokeWidth={1.5} className="mb-4" />
      <h2 className="font-semibold text-zinc-900">No sign-ups yet</h2>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">
        Share your form&apos;s link, print its QR code or add it to your website (see <b>Share &amp; embed</b>). New sign-ups show
        up here within seconds.
      </p>
      <p className="mt-3 max-w-sm text-xs text-zinc-400">Tip: sign up once yourself to see how it works.</p>
    </section>
  );
}

function StatCards({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label={`Sign-ups (${stats.days} days)`}
        value={stats.signups}
        icon={<UserPlus aria-hidden className="size-4" />}
        accent
        note={`${formatCount(stats.allTimeSignups)} since the form was created`}
      />
      <StatCard
        label="Confirmed"
        value={stats.people.confirmed}
        icon={<UserCheck aria-hidden className="size-4" />}
        note="Subscribed and receiving your emails"
      />
      <StatCard
        label="Awaiting confirmation"
        value={stats.people.awaiting}
        icon={<Inbox aria-hidden className="size-4" />}
        note="Haven't clicked the confirmation email yet"
      />
      <StatCard
        label="Spam blocked"
        value={stats.spamBlocked}
        icon={<ShieldBan aria-hidden className="size-4" />}
        note="Bots stopped before reaching your contacts"
      />
    </div>
  );
}

function StatCard({ label, value, note, icon, accent }: { label: string; value: number; note: string; icon: ReactNode; accent?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border bg-white p-3 sm:p-4", accent && "border-emerald-200 bg-emerald-50/40")}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        <span className={accent ? "text-emerald-700" : "text-zinc-400"}>{icon}</span>
        {label}
      </p>
      <p className="text-2xl font-semibold text-zinc-900 tabular-nums">{formatCount(value)}</p>
      <p className="text-xs text-zinc-500">{note}</p>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-white p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function TopSources({ stats }: { stats: Stats }) {
  if (stats.topSources.length === 0) {
    return <p className="text-sm text-zinc-500">No sign-ups in the last {stats.days} days.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Pages people signed up from, last {stats.days} days</caption>
        <thead className="text-xs text-zinc-500">
          <tr className="border-b">
            <th scope="col" className="py-2 pr-3 font-medium">
              Page
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">
              Sign-ups
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">
              Submissions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {stats.topSources.map((s) => (
            <tr key={s.label}>
              <th scope="row" className="max-w-0 py-2 pr-3 font-normal text-zinc-800">
                <span className="block truncate" title={s.label}>
                  {s.label}
                </span>
              </th>
              <td className="py-2 pl-3 text-right text-zinc-900 tabular-nums">{formatCount(s.signups)}</td>
              <td className="py-2 pl-3 text-right text-zinc-500 tabular-nums">{formatCount(s.submissions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-zinc-500">
        &ldquo;Submissions&rdquo; also counts people who were already subscribed or couldn&apos;t be added. Spam isn&apos;t counted.
      </p>
    </div>
  );
}

function Outcomes({ stats }: { stats: Stats }) {
  const rows = [
    { key: "SUBSCRIBED", value: stats.totals.SUBSCRIBED },
    { key: "PENDING", value: stats.totals.PENDING },
    { key: "ALREADY_SUBSCRIBED", value: stats.totals.ALREADY_SUBSCRIBED },
    { key: "NOT_RESUBSCRIBED", value: stats.totals.NOT_RESUBSCRIBED },
    { key: "SUPPRESSED", value: stats.totals.SUPPRESSED },
    { key: "SPAM", value: stats.totals.SPAM },
  ] as const;
  return (
    <div className="flex flex-col gap-3">
      <dl className="divide-y text-sm">
        {rows.map((r) => (
          <div key={r.key} className="flex items-start justify-between gap-3 py-2">
            <dt className="min-w-0">
              <ResultBadge result={r.key} />
              <span className="mt-0.5 block text-xs text-zinc-500">{RESULT_META[r.key].help}</span>
            </dt>
            <dd className="font-medium text-zinc-900 tabular-nums">{formatCount(r.value)}</dd>
          </div>
        ))}
      </dl>
      {stats.people.left > 0 && (
        <p className="text-xs text-zinc-500">
          {formatCount(stats.people.left)} {stats.people.left === 1 ? "person" : "people"} who signed up in this period{" "}
          {stats.people.left === 1 ? "has" : "have"} since unsubscribed or been removed.
        </p>
      )}
    </div>
  );
}

function ResultBadge({ result }: { result: keyof typeof RESULT_META }) {
  const meta = RESULT_META[result];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", meta.className)}>
      {meta.label}
    </span>
  );
}

function RecentSubmissions({ stats }: { stats: Stats }) {
  if (stats.recent.length === 0) return <p className="text-sm text-zinc-500">No submissions yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y text-sm">
        {stats.recent.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zinc-900">
                {r.contactId && r.result !== "SPAM" ? (
                  <Link href={`/contacts/${r.contactId}`} className="hover:text-emerald-700 hover:underline">
                    {r.maskedEmail ?? "Unknown address"}
                  </Link>
                ) : (
                  (r.maskedEmail ?? <span className="font-normal text-zinc-400">No valid address</span>)
                )}
              </p>
              <p className="truncate text-xs text-zinc-500" title={r.source ?? undefined}>
                {r.source ?? "Direct link or QR code"}
              </p>
            </div>
            <div className="flex items-center gap-3 sm:shrink-0">
              <ResultBadge result={r.result} />
              <span className="text-xs whitespace-nowrap text-zinc-500">
                <RelativeTime iso={r.createdAt} />
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-zinc-500">
        Addresses are partly hidden here so this page is safe to share on screen. Click one to open the contact.
      </p>
    </div>
  );
}
