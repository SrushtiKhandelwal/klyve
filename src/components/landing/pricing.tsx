import { CheckIcon, InfoIcon, MinusIcon } from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";
import { BRAND } from "@/lib/brand";

// Only comparisons that are clearly true of most email tools. No names,
// no invented numbers.
const ROWS = [
  { label: "Daily sending cap", typical: "Common on free plans", klyve: "None from us" },
  { label: "Automation", typical: "Often a paid add-on", klyve: "Included" },
  { label: "Who you pay for sending", typical: "The email tool", klyve: "Your provider, directly" },
];

// "Free, really": explains the bring-your-own-provider model honestly.
export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 border-y border-zinc-200 bg-zinc-50/60">
      <div className="mx-auto grid w-full max-w-6xl items-start gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading id="pricing-title" eyebrow="Pricing" title="Free, really" align="left" />
          <div className="mt-6 grid gap-4 text-base leading-7 text-zinc-600">
            <p>
              Klyve doesn&apos;t send email from its own servers. You connect a sending provider you choose, and
              your emails go out through your own account with them.
            </p>
            <p>
              Because we never pay for your sending, we don&apos;t need to charge for it, cap it, or keep
              features behind a plan. You pay your provider directly, at their price. That&apos;s often cents
              per thousand emails, or nothing at all on a free tier.
            </p>
          </div>

          <div className="mt-8 flex gap-3 rounded-2xl border border-emerald-600/15 bg-emerald-50/60 p-5 text-sm leading-6 text-zinc-700">
            <InfoIcon className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <p>
              <span className="font-semibold text-zinc-900">e.g.</span> 2,000 subscribers and 4 newsletters a
              month is 8,000 emails. At a few cents per thousand, that&apos;s well under a dollar a month, and a
              provider&apos;s free tier may cover it entirely. Prices vary, so check your provider&apos;s
              current pricing.
            </p>
          </div>
        </div>

        {/* Comparison card */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {/* Column titles. Hidden from screen readers: each value below
              carries its own hidden label instead, so it reads in order. */}
          <div
            aria-hidden="true"
            className="grid grid-cols-2 gap-x-4 border-b border-zinc-200 bg-zinc-50/80 px-5 py-3 text-sm sm:grid-cols-[1.2fr_1fr_1fr]"
          >
            <span className="hidden sm:block" />
            <span className="font-medium text-zinc-500">Typical plans</span>
            <span className="font-semibold text-emerald-700">{BRAND.name}</span>
          </div>
          {/* On phones the row name sits above its two values; from "sm" up it's a 3-column row. */}
          <ul aria-label="How Klyve compares with typical email marketing plans">
            {ROWS.map((row) => (
              <li
                key={row.label}
                className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-zinc-100 px-5 py-4 text-sm last:border-0 sm:grid-cols-[1.2fr_1fr_1fr]"
              >
                <p className="col-span-2 font-medium text-zinc-900 sm:col-span-1">{row.label}</p>
                <p className="flex gap-1.5 text-zinc-500">
                  <MinusIcon className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden="true" />
                  <span>
                    <span className="sr-only">Typical plans: </span>
                    {row.typical}
                  </span>
                </p>
                <p className="flex gap-1.5 font-medium text-zinc-900">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span>
                    <span className="sr-only">{BRAND.name}: </span>
                    {row.klyve}
                  </span>
                </p>
              </li>
            ))}
          </ul>
          <p className="border-t border-zinc-200 bg-zinc-50/60 px-4 py-3 text-xs leading-5 text-zinc-500 sm:px-5">
            Your provider&apos;s own limits and prices still apply. Klyve adds no fees on top.
          </p>
        </div>
      </div>
    </section>
  );
}
