import Link from "next/link";
import { ShieldCheckIcon } from "lucide-react";
import type { AutoPause } from "@/lib/deliverability/health";

// Campaigns our automatic sending-health check paused (or that were resumed
// after such a pause), newest first, with links to each campaign.

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_LABELS: Record<string, string> = {
  PAUSED: "Paused now",
  SENDING: "Sending again",
  CANCELLED: "Cancelled",
};

export function AutoPauseList({ pauses }: { pauses: AutoPause[] }) {
  return (
    <section className="rounded-xl border bg-white">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold text-zinc-900">Automatic pauses</h2>
        <p className="text-sm text-zinc-500">
          When a campaign&apos;s bounces reach 5% or spam complaints reach 0.3% (checked after the first 200 emails), we
          pause it to protect your provider account.
        </p>
      </div>
      {pauses.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-zinc-500">
          <ShieldCheckIcon className="size-4 shrink-0 text-emerald-600" aria-hidden />
          No campaign has been paused for sending health.
        </p>
      ) : (
        <ul className="divide-y">
          {pauses.map((p) => (
            <li key={p.campaignId} className="flex flex-col gap-1 px-5 py-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Link
                  href={`/campaigns/${p.campaignId}`}
                  className="font-medium break-words text-zinc-900 hover:text-emerald-700 hover:underline"
                >
                  {p.name}
                </Link>
                <span className="text-xs text-zinc-500">
                  {STATUS_LABELS[p.status] ?? p.status} ·{" "}
                  <time dateTime={p.at.toISOString()}>{dateTime.format(p.at)}</time>
                </span>
              </div>
              <p className="break-words text-zinc-600">{p.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
