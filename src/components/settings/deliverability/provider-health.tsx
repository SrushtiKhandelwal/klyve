import Link from "next/link";
import type { ProviderHealth } from "@/lib/deliverability/health";
import { formatPercent, worstStatus } from "@/lib/deliverability/thresholds";
import { StatusPill } from "./status-pill";

// Rates per sending provider. A list of rows rather than a <table>, so it
// fits a phone screen without sideways scrolling.

const TYPE_LABELS: Record<string, string> = {
  SMTP: "SMTP",
  AMAZON_SES: "Amazon SES",
  RESEND: "Resend",
  SENDGRID: "SendGrid",
  MAILGUN: "Mailgun",
  POSTMARK: "Postmark",
};

export function ProviderHealthList({ providers }: { providers: ProviderHealth[] }) {
  return (
    <section className="rounded-xl border bg-white">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold text-zinc-900">By sending provider</h2>
        <p className="text-sm text-zinc-500">Each provider judges your account on its own numbers.</p>
      </div>
      {providers.length === 0 ? (
        <p className="px-5 py-6 text-sm text-zinc-500">
          No providers connected yet.{" "}
          <Link href="/settings/providers" className="font-medium text-emerald-700 hover:underline">
            Connect one
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y">
          {providers.map((p) => (
            <li key={p.id ?? "deleted"} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  {p.id ? (
                    <Link
                      href={`/settings/providers/${p.id}`}
                      className="font-medium break-words text-zinc-900 hover:text-emerald-700 hover:underline"
                    >
                      {p.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-zinc-500">{p.name}</span>
                  )}
                  <StatusPill status={worstStatus(p.status.bounce, p.status.complaint)} />
                </div>
                <p className="text-xs text-zinc-500">
                  {p.type ? TYPE_LABELS[p.type] ?? p.type : "Removed"} · {p.sent.toLocaleString("en-US")} sent
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-sm sm:w-80">
                <Metric label="Bounces" value={p.sent ? formatPercent(p.bounceRate) : "—"} />
                <Metric label="Spam" value={p.sent ? formatPercent(p.complaintRate) : "—"} />
                <Metric label="Unsubscribes" value={p.sent ? formatPercent(p.unsubscribeRate) : "—"} />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900 tabular-nums">{value}</dd>
    </div>
  );
}
