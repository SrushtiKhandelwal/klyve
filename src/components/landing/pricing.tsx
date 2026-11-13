import { CheckIcon, MinusIcon } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { CtaLink } from "@/components/landing/cta-link";
import { SectionHeading } from "@/components/landing/section-heading";
import { BRAND } from "@/lib/brand";

// Only comparisons that are clearly true of most email tools. No names,
// no invented numbers.
const ROWS = [
  { label: "Daily sending cap", typical: "Common on entry plans", klyve: "None from us" },
  { label: "Automation and AI", typical: "Often a paid add-on", klyve: "Included" },
  { label: "Who you pay for sending", typical: "The email tool", klyve: "Your provider, directly" },
];

// What's included, shown like the lines of a statement.
const INCLUDED = ["Campaigns and the editor", "Automations and AI writing", "Transactional API", "Team members and roles"];

// Pricing: the one place the page talks about price. Explains the
// bring-your-own-provider model honestly.
export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-16 border-t border-zinc-200/70 bg-zinc-50">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-16 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-2 lg:gap-20">
        <div>
          <SectionHeading id="pricing-title" eyebrow="Pricing" title="Every feature. No plan to outgrow.">
            {BRAND.name} is free to use: no tiers, no per-email fees and nothing locked behind an upgrade. Your
            emails go out through your own provider account, so you pay them directly, at their price.
          </SectionHeading>

          {/* Comparison. Column titles are hidden from screen readers: each
              value carries its own hidden label instead, so it reads in order. */}
          <div className="mt-12">
            <div
              aria-hidden="true"
              className="grid grid-cols-2 gap-x-4 border-b border-zinc-900 pb-3 text-xs font-medium tracking-wider uppercase sm:grid-cols-[1.25fr_1fr_1fr]"
            >
              <span className="hidden sm:block" />
              <span className="text-zinc-500">Typical plans</span>
              <span className="text-emerald-700">{BRAND.name}</span>
            </div>
            <ul aria-label={`How ${BRAND.name} compares with typical email marketing plans`}>
              {ROWS.map((row) => (
                <li
                  key={row.label}
                  className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-b border-zinc-200 py-4 text-sm sm:grid-cols-[1.25fr_1fr_1fr]"
                >
                  <p className="col-span-2 font-medium text-zinc-950 sm:col-span-1">{row.label}</p>
                  <p className="flex gap-1.5 text-zinc-500">
                    <MinusIcon className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden="true" />
                    <span>
                      <span className="sr-only">Typical plans: </span>
                      {row.typical}
                    </span>
                  </p>
                  <p className="flex gap-1.5 font-medium text-zinc-950">
                    <Glyph icon={CheckIcon} size="sm" strokeWidth={2.25} className="mt-0.5" />
                    <span>
                      <span className="sr-only">{BRAND.name}: </span>
                      {row.klyve}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* The "statement": what a month on Klyve costs. */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_20px_48px_-24px_rgb(0_0_0/0.14)] sm:p-10">
          <p className="text-sm font-medium text-zinc-500">What {BRAND.name} costs you each month</p>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-6xl leading-none font-semibold tracking-[-0.05em] text-zinc-950 sm:text-7xl">
              Free
            </span>
            <span className="text-zinc-500">for every workspace</span>
          </p>

          <dl className="mt-8 grid text-sm">
            {INCLUDED.map((item) => (
              <div
                key={item}
                className="flex items-center justify-between gap-4 border-t border-dashed border-zinc-200 py-3"
              >
                <dt className="flex items-center gap-2.5 text-zinc-800">
                  <Glyph icon={CheckIcon} size="sm" strokeWidth={2.25} />
                  {item}
                </dt>
                <dd className="text-zinc-500">Included</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 border-y border-dashed border-zinc-200 py-3">
              <dt className="pl-6.5 text-zinc-800">Sending</dt>
              <dd className="text-right text-zinc-500">Billed by your provider</dd>
            </div>
          </dl>

          <p className="mt-6 text-xs leading-5 text-zinc-500">
            For example, 2,000 subscribers and 4 newsletters a month is 8,000 emails. Many providers charge a few
            cents per thousand, and several have a free tier that covers it. Prices vary, so check your
            provider&apos;s current rates.
          </p>

          <CtaLink href="/signup" arrow className="mt-8 w-full">
            Create your workspace
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
