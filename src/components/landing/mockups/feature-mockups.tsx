import type { LucideIcon } from "lucide-react";
import {
  ChartColumnIcon,
  ChevronDownIcon,
  DownloadIcon,
  HourglassIcon,
  MailIcon,
  MailOpenIcon,
  SendIcon,
  SparklesIcon,
  SplitIcon,
  UserRoundPlusIcon,
  WorkflowIcon,
} from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { MockButton, MockFrame, MockHeader, StatusDot } from "@/components/landing/mockups/parts";
import { cn } from "@/lib/utils";
import "@/components/landing/landing.css";

// The three larger product pictures in the Features section: an automation,
// the AI campaign writer, and a campaign report.

/* ------------------------------------------------------------------ */
/* Automation                                                          */
/* ------------------------------------------------------------------ */

/** A welcome-series automation in the visual builder. */
export function AutomationMockup({ className }: { className?: string }) {
  return (
    <MockFrame
      label="Example automation: when someone joins the newsletter, send a welcome email, wait 2 days, then send a different follow-up depending on whether they opened it."
      className={className}
    >
      <MockHeader
        title={
          <>
            <Glyph icon={WorkflowIcon} size="sm" />
            Welcome series
          </>
        }
        aside={<StatusDot pulse>Active</StatusDot>}
      />
      {/* The canvas, with a faint dot grid like the real builder. */}
      <div className="flex flex-col items-center bg-zinc-50/80 bg-[radial-gradient(var(--color-zinc-200)_1px,transparent_1px)] [background-size:18px_18px] px-3 py-7 sm:px-6">
        <Node icon={UserRoundPlusIcon} kind="Trigger" title="Joins list: Newsletter" trigger />
        <Connector />
        <Node icon={MailIcon} kind="Send email" title="Welcome to the club" />
        <Connector />
        <Node icon={HourglassIcon} kind="Wait" title="2 days" />
        <Connector />
        <Node icon={SplitIcon} kind="If / else" title="Opened the welcome email?" />
        <Connector short />

        {/* The fork: a bracket whose ends sit above the two columns. */}
        <div className="w-full max-w-sm">
          <div className="mx-auto h-4 w-1/2 rounded-t-lg border-x border-t border-zinc-300" />
          <div className="grid grid-cols-2">
            <Branch label="Yes" icon={SendIcon} title="Getting started tips" />
            <Branch label="No" icon={MailOpenIcon} title="In case you missed it" />
          </div>
        </div>
      </div>
    </MockFrame>
  );
}

function Node({
  icon,
  kind,
  title,
  trigger = false,
}: {
  icon: LucideIcon;
  kind: string;
  title: string;
  trigger?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex w-full max-w-[16.5rem] items-center gap-3 overflow-hidden rounded-xl border bg-white px-3.5 py-2.5 shadow-sm",
        trigger ? "border-emerald-500/40" : "border-zinc-200",
      )}
    >
      {trigger && <span className="absolute inset-y-0 left-0 w-0.5 bg-emerald-500" />}
      <Glyph icon={icon} size="md" />
      <span className="min-w-0">
        <span className="block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">{kind}</span>
        <span className="block truncate text-[13px] font-medium text-zinc-900">{title}</span>
      </span>
    </div>
  );
}

/** The line between two nodes, with a spark of light running down it. */
function Connector({ short = false }: { short?: boolean }) {
  return (
    <div className={cn("relative w-px overflow-hidden bg-zinc-300", short ? "h-3" : "h-6")}>
      <span className="klv-pulse" />
    </div>
  );
}

function Branch({ label, icon, title }: { label: string; icon: LucideIcon; title: string }) {
  return (
    <div className="flex flex-col items-center px-1.5">
      <div className="h-2.5 w-px bg-zinc-300" />
      <span
        className={cn(
          "py-0.5 text-[10px] font-semibold tracking-wider uppercase",
          label === "Yes" ? "text-emerald-700" : "text-zinc-500",
        )}
      >
        {label}
      </span>
      <div className="h-2.5 w-px bg-zinc-300" />
      <div className="flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm">
        <Glyph icon={icon} size="sm" />
        <span className="min-w-0 text-[11px] leading-4 font-medium text-zinc-900">{title}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AI writing                                                          */
/* ------------------------------------------------------------------ */

/** "Generate campaign with AI": one sentence in, a whole draft out. */
export function AiMockup({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <MockFrame label="Generating a campaign with AI from one sentence: Klyve drafts the subject, preview text and email in the brand's design, and can translate it into Hindi.">
        <MockHeader
          title={
            <>
              <Glyph icon={SparklesIcon} size="sm" />
              Generate campaign with AI
            </>
          }
        />
        <div className="p-4">
          <div className="text-[11px] font-medium text-zinc-500">Describe your email</div>
          <div className="mt-1 rounded-lg border border-emerald-500/50 bg-white px-3 py-2.5 text-[13px] leading-5 text-zinc-800 ring-3 ring-emerald-500/10">
            Invite our regulars to a Diwali tasting this Saturday, 4 to 7 pm. Warm and festive.
            <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-zinc-900 motion-safe:animate-pulse" />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 text-[12px] text-zinc-700">
              Tone: Festive
              <ChevronDownIcon className="size-3 text-zinc-400" />
            </span>
            <span className="inline-flex rounded-md bg-zinc-100 p-0.5 text-[11px] font-medium">
              <span className="rounded bg-white px-2 py-1 text-zinc-900 shadow-sm">English</span>
              <span className="px-2 py-1 text-zinc-500">हिन्दी</span>
              <span className="px-2 py-1 text-zinc-500">मराठी</span>
            </span>
            <MockButton className="ml-auto">
              <Glyph icon={SparklesIcon} size="xs" tone="soft" />
              Generate
            </MockButton>
          </div>

          <div className="mt-5 flex items-center gap-3 text-[11px] text-zinc-500">
            <span className="h-px flex-1 bg-zinc-200" />
            Draft ready, in your brand kit
            <span className="h-px flex-1 bg-zinc-200" />
          </div>

          <dl className="mt-4 grid gap-3 text-[12px]">
            <div>
              <dt className="text-[11px] font-medium text-zinc-500">Subject</dt>
              <dd className="mt-0.5 font-medium text-zinc-900">You&apos;re invited: a Diwali tasting, just for you</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-zinc-500">Preview text</dt>
              <dd className="mt-0.5 text-zinc-700">Saturday, 4 to 7 pm. Sweets, chai and our new festive blend.</dd>
            </div>
          </dl>

          {/* A miniature of the generated email. */}
          <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200">
            <div className="h-1.5 bg-linear-to-r from-amber-300 via-orange-400 to-rose-400" />
            <div className="p-3.5">
              <div className="text-[10px] font-semibold tracking-[0.28em] text-[#1f3d2b]">MONSOON</div>
              <div className="mt-2 text-[14px] font-semibold tracking-tight text-zinc-900">
                Join us for a Diwali tasting
              </div>
              <div className="mt-2 grid gap-1.5">
                <span className="h-1.5 w-full rounded-full bg-zinc-100" />
                <span className="h-1.5 w-5/6 rounded-full bg-zinc-100" />
              </div>
              <span className="mt-3 inline-flex h-6 items-center rounded bg-[#1f3d2b] px-3 text-[10px] font-medium text-white">
                Save my seat
              </span>
            </div>
          </div>
        </div>
      </MockFrame>

      {/* The same subject, translated, peeking out from the side. */}
      <div
        aria-hidden="true"
        className="absolute -right-3 -bottom-8 hidden w-64 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_12px_32px_-12px_rgb(0_0_0/0.16)] sm:block lg:-right-10"
      >
        <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-500">
          <Glyph icon={SparklesIcon} size="xs" />
          Translated to Hindi
        </div>
        <p lang="hi" className="mt-1.5 text-[13px] leading-6 font-medium text-zinc-900">
          आप आमंत्रित हैं: सिर्फ़ आपके लिए दिवाली टेस्टिंग
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Campaign report                                                     */
/* ------------------------------------------------------------------ */

const METRICS = [
  { label: "Delivered", value: "1,231", rate: "99.6%" },
  { label: "Opened", value: "612", rate: "49.7%" },
  { label: "Clicked", value: "148", rate: "12.0%" },
  { label: "Unsubscribed", value: "3", rate: "0.2%" },
];

const LINKS = [
  { url: "monsooncoffee.in/autumn-roast", clicks: 92 },
  { url: "monsooncoffee.in/subscribe", clicks: 31 },
  { url: "monsooncoffee.in/visit-us", clicks: 25 },
];

// Opens per hour over 48 hours: a burst after sending, a small evening bump.
const CHART_POINTS = [
  [0, 96], [10, 52], [20, 22], [32, 30], [46, 48], [62, 60], [80, 66], [100, 70], [118, 64],
  [134, 58], [150, 68], [170, 78], [190, 83], [210, 81], [230, 85], [250, 88], [270, 90], [290, 91], [320, 93],
] as const;
const LINE = CHART_POINTS.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");

/** A sent campaign's report, with the chart, top links and an AI summary. */
export function ReportMockup({ className }: { className?: string }) {
  return (
    <MockFrame
      label="A campaign report: delivered, opened, clicked and unsubscribed totals, a chart of opens over 48 hours, the most-clicked links, and an AI summary of the results."
      className={className}
    >
      <MockHeader
        title={
          <>
            <Glyph icon={ChartColumnIcon} size="sm" />
            <span className="truncate">Autumn roast launch</span>
          </>
        }
        aside={
          <MockButton variant="outline">
            <DownloadIcon className="size-3.5 text-zinc-500" />
            Export CSV
          </MockButton>
        }
      />
      <div className="p-4">
        <p className="text-[11px] text-zinc-500">Sent Tue 18 Nov, 10:00 AM · 1,236 recipients</p>

        <div className="mt-3 grid grid-cols-2 gap-y-3 sm:grid-cols-4 sm:divide-x sm:divide-zinc-100">
          {METRICS.map(({ label, value, rate }) => (
            <div key={label} className="sm:px-3 sm:first:pl-0">
              <div className="text-[11px] text-zinc-500">{label}</div>
              <div className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-900 tabular-nums">{value}</div>
              <div className="text-[11px] font-medium text-emerald-700 tabular-nums">{rate}</div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-zinc-700">Opens over time</span>
            <span className="text-zinc-400">First 48 hours</span>
          </div>
          <svg viewBox="0 0 320 100" preserveAspectRatio="none" className="mt-2 block h-24 w-full">
            <defs>
              <linearGradient id="klyve-mock-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#10b981" stopOpacity="0.16" />
                <stop offset="1" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[25, 50, 75].map((y) => (
              <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="#f4f4f5" strokeWidth="1" />
            ))}
            <path d={`${LINE} L320 100 L0 100 Z`} fill="url(#klyve-mock-area)" />
            <path
              d={LINE}
              fill="none"
              stroke="#059669"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="mt-1 flex justify-between text-[10px] text-zinc-400 tabular-nums">
            <span>0h</span>
            <span>12h</span>
            <span>24h</span>
            <span>36h</span>
            <span>48h</span>
          </div>
        </div>

        <div className="mt-4 border-t border-zinc-100 pt-3">
          <div className="text-[11px] font-medium text-zinc-700">Most-clicked links</div>
          <ul className="mt-2 grid gap-2">
            {LINKS.map(({ url, clicks }) => (
              <li key={url} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-[11px]">
                <span className="truncate text-zinc-700">{url}</span>
                <span className="font-medium text-zinc-900 tabular-nums">{clicks}</span>
                <span className="col-span-2 h-1 overflow-hidden rounded-full bg-zinc-100">
                  <span
                    className="block h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.round((clicks / LINKS[0].clicks) * 100)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 truncate font-mono text-[10px] text-zinc-400">
            ?utm_source=klyve&amp;utm_medium=email&amp;utm_campaign=autumn-roast
          </p>
        </div>

        <div className="mt-4 flex gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <Glyph icon={SparklesIcon} size="sm" className="mt-0.5" />
          <p className="text-[12px] leading-5 text-zinc-700">
            <span className="font-medium text-zinc-900">Strong start.</span> Half your opens came in the first 3
            hours, and the roast page got most clicks. Try the same send time next week.
          </p>
        </div>
      </div>
    </MockFrame>
  );
}
