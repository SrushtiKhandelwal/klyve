import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ChartColumnIcon,
  ClipboardListIcon,
  CodeXmlIcon,
  ImagesIcon,
  LayoutTemplateIcon,
  ListFilterIcon,
  MailCheckIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersRoundIcon,
  WorkflowIcon,
} from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { SectionHeading } from "@/components/landing/section-heading";
import { AiMockup, AutomationMockup, ReportMockup } from "@/components/landing/mockups/feature-mockups";
import { MockStage } from "@/components/landing/mockups/parts";
import { cn } from "@/lib/utils";

// Everything on this page is built and working. Keep it that way: only add
// a feature once it ships.

type Spotlight = {
  id: string;
  icon: LucideIcon;
  label: string;
  title: string;
  text: string;
  facts: { title: string; text: string }[];
  Mockup: ComponentType<{ className?: string }>;
};

// The three headline features, each with a large product picture.
const SPOTLIGHTS: Spotlight[] = [
  {
    id: "automations",
    icon: WorkflowIcon,
    label: "Automations",
    title: "Set it up once. It keeps working.",
    text: "Build journeys in a visual builder with triggers, waits and if/else branches, or start from a ready-made recipe and make it your own.",
    facts: [
      { title: "8 ready-made recipes", text: "Welcome series, birthdays, win-back, event reminders and more." },
      { title: "Triggers that fit", text: "Joining a list, signing up through a form, a birthday or another date." },
    ],
    Mockup: AutomationMockup,
  },
  {
    id: "ai",
    icon: SparklesIcon,
    label: "AI writing help",
    title: "Describe it in a sentence. Get a whole campaign.",
    text: "Klyve's AI drafts the subject, preview text and email in your brand's design. It suggests subject lines, rewrites any block, translates into Hindi or Marathi, and explains your results in plain words.",
    facts: [
      { title: "Right inside the editor", text: "Make any heading, text or button shorter, friendlier or more professional." },
      { title: "Only when you ask", text: "It sees what you ask it to work on. Result summaries get totals, never contacts." },
    ],
    Mockup: AiMockup,
  },
  {
    id: "analytics",
    icon: ChartColumnIcon,
    label: "Analytics",
    title: "See what worked, and why.",
    text: "Every campaign gets a live report: deliveries, opens, clicks, unsubscribes and bounces over time, plus your most-clicked links. UTM tags are added for you, and everything exports to CSV.",
    facts: [
      { title: "Statistics in one place", text: "Follow every campaign's results side by side." },
      { title: "Explained for you", text: "A short AI summary with three concrete next steps." },
    ],
    Mockup: ReportMockup,
  },
];

// The rest of the toolkit, as a typographic index (no boxes).
const TOOLKIT: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: LayoutTemplateIcon,
    title: "Drag-and-drop editor",
    text: "Blocks, columns and merge tags, 22 starter templates, and a brand kit that keeps every email on-brand.",
  },
  {
    icon: ListFilterIcon,
    title: "Lists and segments",
    text: "Custom fields, lists, and segments that update themselves. Describe one in plain words and AI builds it.",
  },
  {
    icon: ClipboardListIcon,
    title: "Signup forms",
    text: "A hosted page or embed code, a QR code to share, double opt-in and built-in spam protection.",
  },
  {
    icon: UsersRoundIcon,
    title: "Team workspaces",
    text: "Invite teammates as admins or members. Two-step login keeps every account safe.",
  },
  {
    icon: MailCheckIcon,
    title: "Deliverability",
    text: "Verified senders, SPF, DKIM and DMARC checks, and an automatic pause when bounces climb.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Privacy and consent",
    text: "Suppression lists, a preference centre, and GDPR export or erase for any contact.",
  },
  {
    icon: CodeXmlIcon,
    title: "Transactional API",
    text: "Receipts and password resets through the same provider, with API keys and delivery logs.",
  },
  {
    icon: ImagesIcon,
    title: "Media library",
    text: "Your images in one shared library, and campaigns kept tidy in folders.",
  },
];

// Features: three alternating spotlights with product pictures, then an
// editorial list of everything else.
export function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="scroll-mt-16 overflow-x-clip border-t border-zinc-200/70 bg-zinc-50"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-end lg:gap-16">
          <SectionHeading id="features-title" eyebrow="Platform" title="One workspace for every email you send" />
          <p className="max-w-xl text-lg leading-8 text-pretty text-zinc-600 lg:pb-1.5">
            Campaigns, automations, transactional email and an AI that helps with all of it, designed to work
            together from the first click.
          </p>
        </div>

        <div className="mt-20 grid gap-24 sm:mt-28 sm:gap-32">
          {SPOTLIGHTS.map(({ id, icon, label, title, text, facts, Mockup }, i) => (
            <article
              key={id}
              id={id}
              aria-labelledby={`${id}-title`}
              className="grid scroll-mt-24 grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20"
            >
              <div className={cn(i % 2 === 1 && "lg:order-2")}>
                <p className="flex items-center gap-2.5 text-sm font-medium text-emerald-700">
                  <Glyph icon={icon} size="md" />
                  {label}
                </p>
                <h3
                  id={`${id}-title`}
                  className="mt-4 text-3xl leading-[1.1] font-semibold tracking-[-0.03em] text-balance text-zinc-950 sm:text-4xl"
                >
                  {title}
                </h3>
                <p className="mt-5 text-lg leading-8 text-pretty text-zinc-600">{text}</p>
                <dl className="mt-8 grid gap-6 border-t border-zinc-200 pt-6 sm:grid-cols-2">
                  {facts.map((fact) => (
                    <div key={fact.title}>
                      <dt className="text-sm font-semibold text-zinc-950">{fact.title}</dt>
                      <dd className="mt-1 text-sm leading-6 text-zinc-600">{fact.text}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <MockStage className="mx-auto w-full max-w-lg">
                <Mockup />
              </MockStage>
            </article>
          ))}
        </div>

        {/* Everything else */}
        <div className="mt-28 grid grid-cols-1 gap-10 sm:mt-36 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <h3 className="text-3xl leading-[1.1] font-semibold tracking-[-0.03em] text-balance text-zinc-950 sm:text-4xl">
              And everything else, built in
            </h3>
            <p className="mt-5 text-lg leading-8 text-pretty text-zinc-600">
              The rest of the toolkit a serious email programme needs, in the same workspace and on every account.
            </p>
          </div>

          <ul className="border-b border-zinc-200">
            {TOOLKIT.map(({ icon, title, text }) => (
              <li
                key={title}
                className="grid gap-x-8 gap-y-2 border-t border-zinc-200 py-6 sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-baseline"
              >
                <h4 className="flex items-center gap-3 text-xl font-semibold tracking-[-0.02em] text-zinc-950">
                  <Glyph icon={icon} size="md" className="translate-y-px" />
                  {title}
                </h4>
                <p className="pl-8 text-[15px] leading-7 text-zinc-600 sm:pl-0">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
