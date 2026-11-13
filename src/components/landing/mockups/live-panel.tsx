import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { MailOpenIcon, MegaphoneIcon, MousePointerClickIcon, SendIcon, UserRoundPlusIcon, WorkflowIcon } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { MockFrame, MockHeader } from "@/components/landing/mockups/parts";
import "@/components/landing/landing.css";

// The hero's right-hand panel: Klyve "working right now". A campaign finishes
// sending, its open and click rates tick up, and new activity arrives.
//
// All the motion is CSS (the klv-* classes in landing.css) and plays once on
// load. Each element's normal style is its finished state, so with reduced
// motion the panel is simply shown complete. Sample names and numbers only.

type Activity = { icon: LucideIcon; who: string; what: string; when: string };

// Newest first, like a real feed. They arrive from the bottom up: the oldest
// row appears first, then each newer one above it.
const ACTIVITY: Activity[] = [
  { icon: MousePointerClickIcon, who: "Rahul", what: "clicked “Shop the roast”", when: "just now" },
  { icon: MailOpenIcon, who: "Priya", what: "opened “Our autumn roast is here”", when: "4s ago" },
  { icon: WorkflowIcon, who: "Anita", what: "moved to step 2 of Welcome series", when: "12s ago" },
  { icon: UserRoundPlusIcon, who: "Meera", what: "joined Newsletter from your signup form", when: "31s ago" },
  { icon: SendIcon, who: "Sent", what: "1,236 of 1,236 through Amazon SES", when: "1m ago" },
];

// When each row arrives (seconds after load), matching ACTIVITY's order.
const ARRIVALS = [8.4, 6.9, 5.4, 4.1, 3.0];

// Opens per minute over the last hour, for the sparkline (y: 0 = top).
const SPARK = "M0 34 L12 30 L24 31 L36 22 L48 25 L60 16 L72 19 L84 12 L96 15 L108 8 L120 11 L132 6 L144 9 L156 4 L168 7 L180 3";

export function LivePanel({ className }: { className?: string }) {
  return (
    <MockFrame
      label="Klyve at work: a campaign finishing sending through Amazon SES, its open and click rates rising, and new activity arriving, such as opens, clicks, an automation step and a new signup."
      className={className}
    >
      <MockHeader
        title={
          <>
            <Glyph icon={MegaphoneIcon} size="sm" />
            <span className="truncate">Autumn roast launch</span>
          </>
        }
        aside={
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
              <span className="relative size-1.5 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        }
      />

      {/* Sending progress */}
      <div className="px-5 pt-4">
        <div className="flex items-baseline justify-between gap-3 text-[12px]">
          <span className="text-zinc-600">Sending through Amazon SES</span>
          <span className="font-medium text-zinc-950 tabular-nums">
            <span className="klv-count klv-count-sent" />%
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div className="klv-bar h-full rounded-full bg-emerald-500" />
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">1,236 recipients · Newsletter</p>
      </div>

      {/* Rates, ticking up */}
      <div className="mx-5 mt-4 grid grid-cols-3 divide-x divide-zinc-100 border-t border-zinc-100 pt-4">
        <Metric label="Delivered" value="99.6%" />
        <Metric label="Opened" counter="klv-count-opens" />
        <Metric label="Clicked" counter="klv-count-clicks" />
      </div>
      <div className="px-5 pt-3 pb-4">
        <svg viewBox="0 0 180 38" preserveAspectRatio="none" className="klv-draw block h-9 w-full">
          <path
            d={SPARK}
            fill="none"
            stroke="#10b981"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <p className="mt-1 text-[11px] text-zinc-500">Opens in the last hour</p>
      </div>

      {/* Activity feed */}
      <div className="border-t border-zinc-200">
        <div className="flex items-center justify-between px-5 pt-3 pb-1.5 text-[11px] font-medium text-zinc-500">
          <span>Activity</span>
          <span>Updating live</span>
        </div>
        <ul>
          {ACTIVITY.map(({ icon, who, what, when }, i) => (
            <li
              key={what}
              style={{ "--feed-delay": `${ARRIVALS[i]}s` } as CSSProperties}
              className="klv-feed-row flex items-center gap-3 border-t border-zinc-100 px-5 py-2.5 first:border-t-0"
            >
              <Glyph icon={icon} size="sm" />
              <p className="min-w-0 flex-1 truncate text-[13px] text-zinc-600">
                <span className="font-medium text-zinc-950">{who}</span> {what}
              </p>
              <span className="shrink-0 text-[11px] text-zinc-500 tabular-nums">{when}</span>
            </li>
          ))}
        </ul>
      </div>
    </MockFrame>
  );
}

function Metric({ label, value, counter }: { label: string; value?: string; counter?: string }) {
  return (
    <div className="px-3 first:pl-0">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-950 tabular-nums">
        {counter ? (
          <>
            <span className={`klv-count ${counter}`} />%
          </>
        ) : (
          value
        )}
      </div>
    </div>
  );
}
