import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { CheckIcon, PenLineIcon, PlugZapIcon, UsersIcon } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { SectionHeading } from "@/components/landing/section-heading";
import { MockStage } from "@/components/landing/mockups/parts";
import { ImportMockup, ProviderMockup, SendMockup } from "@/components/landing/mockups/setup-mockups";

type Step = {
  icon: LucideIcon;
  title: string;
  text: string;
  points: string[];
  Mockup: ComponentType<{ className?: string }>;
};

const STEPS: Step[] = [
  {
    icon: PlugZapIcon,
    title: "Connect your provider",
    text: "Paste an API key or SMTP details for Amazon SES, Resend, SendGrid, Mailgun, Postmark or Gmail. Klyve tests the connection and checks your domain before anything is sent.",
    points: [
      "SPF, DKIM and DMARC checked for you",
      "Verified senders for every address you use",
      "Keys encrypted, never shown again",
    ],
    Mockup: ProviderMockup,
  },
  {
    icon: UsersIcon,
    title: "Bring your audience",
    text: "Import a CSV and match each column to a field, or grow your list with hosted signup forms. Organise everyone into lists and segments that keep themselves up to date.",
    points: [
      "Custom fields for anything you track",
      "Signup forms with double opt-in",
      "Unsubscribes and bounces respected automatically",
    ],
    Mockup: ImportMockup,
  },
  {
    icon: PenLineIcon,
    title: "Create and send",
    text: "Design in the drag-and-drop editor with your brand kit, let AI draft the words, then send now, schedule it for later, or hand it to an automation.",
    points: [
      "A final check before every send",
      "Open and click tracking, with UTM tags",
      "Sending pauses by itself if bounces climb",
    ],
    Mockup: SendMockup,
  },
];

// Three connected steps from sign-up to first email: a thin emerald rail with
// a marker per step, the words on the left and the real screen on the right.
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-16 overflow-x-clip border-t border-zinc-200/70">
      <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
        <SectionHeading id="how-title" eyebrow="How it works" title="From first login to first send">
          Three steps, with Klyve checking the details at each one, so your first campaign goes out right.
        </SectionHeading>

        <ol className="relative mt-16 sm:mt-24">
          {/* The rail joining the steps. */}
          <div
            aria-hidden="true"
            className="absolute top-3 bottom-0 left-2 w-px bg-linear-to-b from-emerald-500 via-emerald-500/30 to-transparent"
          />

          {STEPS.map(({ icon, title, text, points, Mockup }, i) => (
            <li
              key={title}
              className="relative grid grid-cols-1 gap-10 pb-20 pl-10 last:pb-0 sm:pl-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-20 lg:pb-32"
            >
              {/* The marker on the rail. */}
              <span
                aria-hidden="true"
                className="absolute top-1.5 left-0 flex size-[17px] items-center justify-center rounded-full bg-white shadow-[0_0_0_6px_rgb(16_185_129/0.08)] ring-1 ring-emerald-500/50 lg:top-[calc(50%-8px)]"
              >
                <span className="size-[7px] rounded-full bg-linear-to-br from-emerald-400 to-teal-600" />
              </span>

              <div>
                <p
                  aria-hidden="true"
                  className="bg-linear-to-b from-emerald-600/60 to-emerald-600/0 bg-clip-text font-mono text-6xl leading-none font-semibold tracking-tighter text-transparent sm:text-7xl"
                >
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-4 flex items-center gap-3 text-2xl font-semibold tracking-[-0.025em] text-zinc-950 sm:text-3xl">
                  <Glyph icon={icon} size="lg" />
                  <span>
                    <span className="sr-only">Step {i + 1}: </span>
                    {title}
                  </span>
                </h3>
                <p className="mt-4 text-base leading-7 text-pretty text-zinc-600 sm:text-lg sm:leading-8">{text}</p>
                <ul className="mt-6 grid gap-2.5">
                  {points.map((point) => (
                    <li key={point} className="flex items-start gap-2.5 text-sm leading-6 text-zinc-700">
                      <Glyph icon={CheckIcon} size="sm" strokeWidth={2.25} className="mt-1" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              <MockStage className="mx-auto w-full max-w-lg lg:max-w-none">
                <Mockup />
              </MockStage>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
