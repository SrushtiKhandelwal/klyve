import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";

const linkClass = "font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800";

const QUESTIONS: { q: string; a: ReactNode }[] = [
  {
    q: "What does Klyve cost?",
    a: (
      <p>
        Nothing. There are no plans or per-email fees. The only cost is your sending provider, which you pay
        directly. Many charge cents per thousand emails, and several have a free tier.
      </p>
    ),
  },
  {
    q: "What is a sending provider?",
    a: (
      <p>
        It&apos;s the service that actually delivers your email, such as Amazon SES, Resend, SendGrid, Mailgun,
        Postmark, or any SMTP server. You create an account with them, then paste your API key or SMTP details
        into Klyve. We check the connection before you send anything.
      </p>
    ),
  },
  {
    q: "Can I use Gmail?",
    a: (
      <p>
        Yes, through SMTP with an app password. Google limits how much a Gmail account can send each day
        (around 500 for a personal account), and Klyve warns you before a campaign would go over. It&apos;s
        fine for small lists; for anything bigger, a dedicated provider is a better fit.
      </p>
    ),
  },
  {
    q: "Is my data safe?",
    a: (
      <p>
        Each workspace&apos;s data is kept separate, and every request checks you belong to it. Provider
        passwords and API keys are encrypted before they&apos;re stored and are never shown again. You can
        export or erase any contact&apos;s data on request. Read the{" "}
        <Link href="/privacy" className={linkClass}>
          Privacy Policy
        </Link>{" "}
        for the details.
      </p>
    ),
  },
  {
    q: "Can I import contacts from another tool?",
    a: (
      <p>
        Yes. Export your contacts as a CSV file from your current tool, upload it, and match each column to a
        Klyve field. You can put everyone into a list as you import. Only import people who agreed to hear
        from you.
      </p>
    ),
  },
  {
    q: "Do you have an API?",
    a: (
      <p>
        Yes. The transactional email API sends one-to-one emails like receipts and password resets, with API
        keys, idempotency and delivery logs. See the{" "}
        <Link href="/docs/api" className={linkClass}>
          API docs
        </Link>
        .
      </p>
    ),
  },
];

// Frequently asked questions as an accordion. There's no accordion in
// components/ui, so we use the browser's own <details>/<summary>: it works
// with the keyboard and screen readers, even before JavaScript loads.
export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-t border-zinc-200 bg-zinc-50/60">
      <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered" />

        <div className="mt-12 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
          {QUESTIONS.map(({ q, a }) => (
            <details key={q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left font-medium text-zinc-900 outline-none select-none hover:text-emerald-800 focus-visible:ring-3 focus-visible:ring-emerald-600/40 focus-visible:ring-inset sm:px-6 [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDownIcon
                  className="size-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <div className="px-5 pb-5 text-sm leading-6 text-zinc-600 sm:px-6">{a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
