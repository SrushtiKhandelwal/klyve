import { cn } from "@/lib/utils";
import type { RateSet } from "@/lib/deliverability/health";
import {
  BOUNCE_RATE_CRITICAL,
  BOUNCE_RATE_WARNING,
  COMPLAINT_RATE_GOOD,
  COMPLAINT_RATE_LIMIT,
  formatPercent,
  LOW_VOLUME,
  UNSUBSCRIBE_RATE_WARNING,
  type HealthStatus,
} from "@/lib/deliverability/thresholds";
import { STATUS_META, StatusPill } from "./status-pill";

// The three big numbers at the top of the Deliverability page, each with a
// traffic light and a plain-English "what this means / what to do".

type CardInfo = {
  title: string;
  rate: number;
  count: number;
  countLabel: string;
  status: HealthStatus;
  what: string;
  advice: Partial<Record<HealthStatus, string>>;
};

export function HealthCards({ overall, days }: { overall: RateSet; days: number }) {
  const cards: CardInfo[] = [
    {
      title: "Hard bounces",
      rate: overall.bounceRate,
      count: overall.hardBounces,
      countLabel: "bounced",
      status: overall.status.bounce,
      what: `Emails sent to addresses that don't exist. Keep this under ${formatPercent(BOUNCE_RATE_WARNING)}. At ${formatPercent(BOUNCE_RATE_CRITICAL)} we pause the campaign for you.`,
      advice: {
        warning: "Some addresses on your lists are out of date. Remove contacts who haven't opened in a long time.",
        critical:
          "This looks like an old or bought list. Stop using it: providers suspend accounts with this many bounces.",
      },
    },
    {
      title: "Spam complaints",
      rate: overall.complaintRate,
      count: overall.complaints,
      countLabel: "marked as spam",
      status: overall.status.complaint,
      what: `People who clicked “Report spam”. Gmail and Yahoo require under ${formatPercent(COMPLAINT_RATE_LIMIT)}; aim for under ${formatPercent(COMPLAINT_RATE_GOOD)}.`,
      advice: {
        warning: "Make sure everyone signed up themselves, and that your emails say clearly who they're from.",
        critical:
          "Gmail and Yahoo may send your email to spam or reject it. Only email people who asked for it, and email less often.",
      },
    },
    {
      title: "Unsubscribes",
      rate: overall.unsubscribeRate,
      count: overall.unsubscribes,
      countLabel: "unsubscribed",
      status: overall.status.unsubscribe,
      what: `People who left using the link in your email. Under ${formatPercent(UNSUBSCRIBE_RATE_WARNING)} per email is normal.`,
      advice: {
        warning: "Some people didn't expect these emails. Check your sending frequency and that content matches what they signed up for.",
        critical: "Many people are leaving. Better to send less, to the people who really want your emails.",
      },
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-semibold text-zinc-900">Last {days} days</h2>
        <p className="text-sm text-zinc-500">
          {overall.sent === 0
            ? "No campaign emails sent yet. These numbers fill in once you send."
            : `Based on ${overall.sent.toLocaleString("en-US")} campaign email${overall.sent === 1 ? "" : "s"} sent.`}
          {overall.sent > 0 && overall.sent < LOW_VOLUME && " With so few emails, one or two events move the numbers a lot."}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <HealthCard key={card.title} card={card} sent={overall.sent} />
        ))}
      </div>
    </section>
  );
}

function HealthCard({ card, sent }: { card: CardInfo; sent: number }) {
  const advice = card.advice[card.status];
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-white p-5", STATUS_META[card.status].border)}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-600">{card.title}</h3>
        <StatusPill status={card.status} />
      </div>
      <div>
        <p className="text-3xl font-semibold tracking-tight text-zinc-900">{sent > 0 ? formatPercent(card.rate) : "—"}</p>
        {sent > 0 && (
          <p className="text-xs text-zinc-500">
            {card.count.toLocaleString("en-US")} {card.countLabel}
          </p>
        )}
      </div>
      <p className="text-sm text-zinc-500">{card.what}</p>
      {advice && <p className="text-sm font-medium text-zinc-800">{advice}</p>}
    </div>
  );
}
