import type { ReactNode } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { FaqContact } from "@/components/landing/contact-email";
import { SectionHeading } from "@/components/landing/section-heading";

const linkClass = "font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800";

const QUESTIONS: { q: string; a: ReactNode }[] = [
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
    q: "What do I pay for sending?",
    a: (
      <p>
        Your provider bills you directly, at their own rates. Many charge a few cents per thousand emails, and
        several include a monthly allowance at no cost. Klyve adds nothing on top, and sets no daily sending cap
        of its own. See{" "}
        <Link href="#pricing" className={linkClass}>
          Pricing
        </Link>
        .
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
    q: "How does the AI writing help work?",
    a: (
      <p>
        It only runs when you click it, and only sees what you ask it to work on: your one-sentence brief, or
        the text you want to improve or translate. When it explains a campaign&apos;s results, it gets totals
        only, never a contact&apos;s email or name. Each workspace has a monthly AI allowance.
      </p>
    ),
  },
  {
    q: "Can my team work in the same workspace?",
    a: (
      <p>
        Yes. Invite teammates by email as an admin or a member, and the owner can change roles at any time.
        Everyone can turn on two-step login for extra protection.
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

// Frequently asked questions. There's no accordion in components/ui, so we
// use the browser's own <details>/<summary>: it works with the keyboard and
// screen readers, even before JavaScript loads.
export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 border-t border-zinc-200/70">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered">
            Anything else on your mind? The{" "}
            <Link href="/docs/api" className={linkClass}>
              API docs
            </Link>{" "}
            go deeper on the technical side.
          </SectionHeading>
        </div>

        <div>
          <div className="border-b border-zinc-200">
            {QUESTIONS.map(({ q, a }) => (
              <details key={q} className="group border-t border-zinc-200">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-md py-5 text-left text-lg font-medium tracking-[-0.01em] text-zinc-950 outline-none select-none hover:text-emerald-800 focus-visible:ring-3 focus-visible:ring-emerald-600/40 [&::-webkit-details-marker]:hidden">
                  {q}
                  <PlusIcon
                    className="size-5 shrink-0 text-emerald-600 transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </summary>
                <div className="max-w-2xl pr-10 pb-6 text-[15px] leading-7 text-zinc-600">{a}</div>
              </details>
            ))}
          </div>
          {/* Only shown when CONTACT_EMAIL is set. */}
          <FaqContact />
        </div>
      </div>
    </section>
  );
}
