import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AutomationPreview } from "@/components/landing/automation-preview";

// Short, true facts shown under the buttons.
const POINTS = ["No credit card", "No daily sending cap from us", "Automation included"];

// The first thing visitors see: what Klyve is, and the two main actions.
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      {/* One soft emerald wash behind the hero, nothing more. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-gradient-to-b from-emerald-50/70 to-transparent"
      />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-24 lg:pb-24">
        <div className="text-center lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-600/15 bg-white px-3 py-1 text-sm font-medium text-emerald-700 shadow-sm">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Free. Bring your own sending provider.
          </p>

          <h1
            id="hero-title"
            className="mt-6 text-4xl font-semibold tracking-tight text-balance text-zinc-900 sm:text-5xl lg:text-6xl"
          >
            Email marketing without the limits
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-pretty text-zinc-600 lg:mx-0">
            Contacts, campaigns, a drag-and-drop editor, automation and a developer API, all free. Connect
            Amazon SES, Resend, SendGrid, Mailgun, Postmark or any SMTP server, and send as much as your
            provider allows.
          </p>

          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/signup" />}
              className="h-11 bg-emerald-600 px-6 text-base text-white hover:bg-emerald-700 focus-visible:ring-emerald-600/40"
            >
              Create a free account
              <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link href="/docs/api" />}
              className="h-11 px-6 text-base"
            >
              Read the API docs
            </Button>
          </div>

          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-zinc-600 lg:justify-start">
            {POINTS.map((point) => (
              <li key={point} className="flex items-center gap-1.5">
                <CheckIcon className="size-4 text-emerald-600" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <AutomationPreview className="mx-auto w-full max-w-md lg:max-w-none" />
      </div>
    </section>
  );
}
