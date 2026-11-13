import Link from "next/link";
import { MailCheckIcon } from "lucide-react";

// Plain-English summary of Gmail's and Yahoo's rules for bulk senders
// (in force since February 2024). Static text, no data needed.

export function BulkSenderRules() {
  return (
    <section className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 text-sm text-zinc-700">
      <MailCheckIcon className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
      <div className="grid min-w-0 gap-2">
        <h2 className="font-medium text-zinc-900">Gmail and Yahoo rules for bulk senders</h2>
        <p>
          If you send more than about 5,000 emails a day to Gmail or Yahoo addresses, they require all of this. Below
          that volume, following it still makes a big difference to landing in the inbox.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Authenticate your domain</strong> with SPF and DKIM, and publish a DMARC record (p=none is enough to
            start). Your From address must use that domain, not @gmail.com.{" "}
            <Link href="/settings/domains" className="font-medium text-emerald-700 hover:underline">
              Check your domain
            </Link>
          </li>
          <li>
            <strong>Keep spam complaints under 0.3%</strong>, ideally under 0.1%. Only email people who asked to hear
            from you.
          </li>
          <li>
            <strong>One-click unsubscribe</strong> in every marketing email, honoured within 2 days. Klyve adds this to
            every campaign for you.
          </li>
          <li>
            <strong>Remove bounced addresses.</strong> Klyve blocks hard-bounced and complaining addresses automatically
            when your provider reports them.
          </li>
          <li>
            <strong>Send steadily.</strong> A new domain or provider should start small and grow over a few weeks rather
            than send to a whole list on day one.
          </li>
        </ul>
      </div>
    </section>
  );
}
