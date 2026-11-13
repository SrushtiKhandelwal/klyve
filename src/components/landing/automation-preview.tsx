import type { ComponentType, ReactNode } from "react";
import {
  ClockIcon,
  MailIcon,
  MailOpenIcon,
  PlugIcon,
  SendIcon,
  SplitIcon,
  UserPlusIcon,
  WorkflowIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// A stylised picture of the automation builder, made from plain divs (not a
// screenshot), so it stays sharp at every size and costs no image download.
// It's decorative: screen readers get one sentence (the aria-label) instead.
export function AutomationPreview({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Example automation: when someone joins your newsletter, send a welcome email, wait 2 days, then send a different follow-up depending on whether they opened it."
      className={cn(
        "overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-zinc-900/[0.06]",
        className,
      )}
    >
      <div aria-hidden="true">
        {/* Window bar: where you are + status */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <WorkflowIcon className="size-4 shrink-0 text-zinc-400" />
            <span className="hidden text-zinc-500 sm:inline">Automations</span>
            <span className="hidden text-zinc-300 sm:inline">/</span>
            <span className="truncate font-medium text-zinc-900">Welcome series</span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/15">
            <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
            Active
          </span>
        </div>

        {/* The canvas, with a faint dot grid like the real builder */}
        <div className="flex flex-col items-center bg-zinc-50/80 bg-[radial-gradient(var(--color-zinc-200)_1px,transparent_1px)] [background-size:18px_18px] px-3 py-6 sm:px-6 sm:py-8">
          <Step
            icon={UserPlusIcon}
            kind="Trigger"
            title="Joins list: Newsletter"
            tone="trigger"
          />
          <Line />
          <Step icon={MailIcon} kind="Send email" title="Welcome to the club" />
          <Line />
          <Step icon={ClockIcon} kind="Wait" title="2 days" tone="muted" />
          <Line />
          <Step icon={SplitIcon} kind="If / else" title="Opened the welcome email?" tone="muted" />

          {/* The fork: a bracket whose ends sit exactly above the two columns
              (each column is half the width, so their centres are at 25% / 75%). */}
          <Line />
          <div className="w-full max-w-sm">
            <div className="mx-auto h-4 w-1/2 rounded-t-lg border-x border-t border-zinc-300" />
            <div className="grid grid-cols-2">
              <Branch label="Yes">
                <MiniStep icon={SendIcon} title="Getting started tips" />
              </Branch>
              <Branch label="No">
                <MiniStep icon={MailOpenIcon} title="In case you missed it" />
              </Branch>
            </div>
          </div>
        </div>

        {/* Footer: makes the bring-your-own-provider idea visible */}
        <div className="flex items-start gap-2 border-t border-zinc-200 px-4 py-3 text-xs leading-5 text-zinc-600">
          <PlugIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
          <span>
            Sends through <span className="font-medium text-zinc-900">your own provider</span>, with no daily cap from us
          </span>
        </div>
      </div>
    </div>
  );
}

type Icon = ComponentType<{ className?: string }>;

const TONES = {
  trigger: "bg-emerald-600 text-white",
  action: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15",
  muted: "bg-zinc-100 text-zinc-600",
} as const;

/** One full-width node of the flow. */
function Step({
  icon: Icon,
  kind,
  title,
  tone = "action",
}: {
  icon: Icon;
  kind: string;
  title: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="flex w-full max-w-[17rem] items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{kind}</span>
        <span className="block truncate text-sm font-medium text-zinc-900">{title}</span>
      </span>
    </div>
  );
}

/** A smaller node used inside a branch. */
function MiniStep({ icon: Icon, title }: { icon: Icon; title: string }) {
  return (
    <div className="flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", TONES.action)}>
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 text-xs leading-4 font-medium text-zinc-900">{title}</span>
    </div>
  );
}

/** One side of the if/else fork, with its "Yes"/"No" tag. */
function Branch({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-1.5">
      <div className="h-3 w-px bg-zinc-300" />
      <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600">
        {label}
      </span>
      <div className="h-3 w-px bg-zinc-300" />
      {children}
    </div>
  );
}

/** The vertical connector between two nodes. */
function Line() {
  return <div className="h-5 w-px bg-zinc-300" />;
}
