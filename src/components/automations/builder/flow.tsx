"use client";

// The workflow drawn as a top-to-bottom flow chart, with plain CSS:
//
//          [ Trigger ]
//              │  (+)
//          [ Step    ]
//              │  (+)
//          [ If/else ]
//          ┌───┴───┐
//       If yes   If no      ← two columns on wider screens,
//        (+)      (+)          stacked with headings on phones
//       [ … ]    [ … ]
//          └───┬───┘
//        then continue
//              │  (+)
//            End
import { Fragment } from "react";
import { CircleAlert, Flag, Plus, Zap } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AutomationStep, AutomationTrigger } from "@/lib/automations/schema";
import { cn } from "@/lib/utils";
import { STEP_LABELS, stepParts, triggerParts, type Lookups, type Part } from "../describe";
import { STEP_ICONS, STEP_TONES, TRIGGER_ICONS } from "../icons";
import { NEW_STEP_HINTS, type NewStepType } from "./new-step";
import { ROOT, type ContainerRef } from "./tree";

export type InsertOption = { type: NewStepType; blocker: string | null };

export type FlowProps = {
  trigger: AutomationTrigger;
  steps: AutomationStep[];
  lookups: Lookups;
  /** "trigger", a step id, or null. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  readOnly: boolean;
  /** Step ids that need attention (amber dot on the card). */
  flagged: Set<string>;
  insertOptions: (ref: ContainerRef, index: number) => InsertOption[];
  onInsert: (ref: ContainerRef, index: number, type: NewStepType) => void;
};

export function Flow(props: FlowProps) {
  const { trigger, lookups, selectedId, onSelect } = props;
  const TriggerIcon = TRIGGER_ICONS[trigger.type];
  return (
    // Wide branches may need sideways room on a desktop; phones stack instead.
    <div className="w-full overflow-x-auto pb-2">
      <div className="mx-auto flex w-full min-w-fit flex-col items-center px-1 py-2">
        <NodeButton
          selected={selectedId === "trigger"}
          onClick={() => onSelect("trigger")}
          className="border-emerald-200 bg-emerald-50/50"
          ariaLabel="Edit the trigger"
        >
          <Glyph icon={TriggerIcon} size="lg" strokeWidth={1.5} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-emerald-700 uppercase">
              <Zap className="size-3" aria-hidden />
              Trigger
            </span>
            <Sentence parts={triggerParts(trigger, lookups)} />
          </span>
        </NodeButton>

        <StepList {...props} list={props.steps} container={ROOT} />

        <Line />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200">
          <Flag className="size-3.5" aria-hidden />
          End
        </span>
      </div>
    </div>
  );
}

/** One list of steps (the main path, or one side of an if/else), with "+" buttons between. */
function StepList(props: FlowProps & { list: AutomationStep[]; container: ContainerRef }) {
  const { list, container } = props;
  const exitAt = list.findIndex((s) => s.type === "exit");
  return (
    <>
      <Connector {...props} container={container} index={0} />
      {list.map((step, i) => (
        <Fragment key={step.id}>
          <StepNode {...props} step={step} />
          {/* Nothing can follow an "Exit": the path ends there. */}
          {(exitAt === -1 || i < exitAt) && <Connector {...props} container={container} index={i + 1} />}
        </Fragment>
      ))}
    </>
  );
}

function StepNode(props: FlowProps & { step: AutomationStep }) {
  const { step, steps, lookups, selectedId, onSelect, flagged } = props;
  const Icon = STEP_ICONS[step.type];
  const card = (
    <NodeButton selected={selectedId === step.id} onClick={() => onSelect(step.id)} ariaLabel={`Edit step: ${STEP_LABELS[step.type]}`}>
      <Glyph icon={Icon} size="lg" tone="current" strokeWidth={1.5} className={STEP_TONES[step.type]} />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{STEP_LABELS[step.type]}</span>
        <Sentence parts={stepParts(step, steps, lookups)} />
      </span>
      {flagged.has(step.id) && (
        <CircleAlert className="size-4 shrink-0 text-amber-500" aria-label="Needs attention" />
      )}
    </NodeButton>
  );

  if (step.type !== "condition") return card;

  const yesEnds = step.yes.some((s) => s.type === "exit");
  const noEnds = step.no.some((s) => s.type === "exit");
  return (
    <>
      {card}
      <div className="flex w-full flex-col items-center">
        {/* The fork: a line down, then a bracket over both columns (wider screens only). */}
        <Line className="hidden md:block" />
        <div className="hidden h-4 w-1/2 rounded-t-xl border-x border-t border-zinc-300 md:block" aria-hidden />
        <div className="mt-3 grid w-full gap-4 md:mt-0 md:grid-cols-2 md:gap-6">
          <Branch {...props} label="If yes" tone="yes" list={step.yes} container={{ conditionId: step.id, branch: "yes" }} ends={yesEnds} />
          <Branch {...props} label="If no" tone="no" list={step.no} container={{ conditionId: step.id, branch: "no" }} ends={noEnds} />
        </div>
        {/* The join: both columns meet again, then the flow carries on. */}
        <div className="hidden h-4 w-1/2 rounded-b-xl border-x border-b border-zinc-300 md:block" aria-hidden />
        <Line />
        <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-zinc-500 ring-1 ring-zinc-200">
          {yesEnds && noEnds ? "both paths end above" : "then continue"}
        </span>
      </div>
    </>
  );
}

function Branch(
  props: FlowProps & { label: string; tone: "yes" | "no"; list: AutomationStep[]; container: ContainerRef; ends: boolean },
) {
  const { label, tone, list, container, ends } = props;
  return (
    <section
      aria-label={label}
      className={cn(
        // Phones: a tinted box per branch, one under the other. Wider: two open columns.
        "flex min-w-0 flex-col items-center rounded-xl border px-2 py-3 md:min-w-64 md:border-0 md:px-0 md:py-0",
        tone === "yes" ? "border-emerald-200 bg-emerald-50/30 md:bg-transparent" : "border-rose-200 bg-rose-50/30 md:bg-transparent",
      )}
    >
      <span
        className={cn(
          "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
          tone === "yes" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-rose-50 text-rose-700 ring-rose-600/20",
        )}
      >
        {label}
      </span>
      <StepList {...props} list={list} container={container} />
      {list.length === 0 && <span className="text-[11px] text-zinc-400">Nothing yet: goes straight on</span>}
      {/* Fills the column so the line reaches the join below (unless this path ended with "Exit"). */}
      <div className={cn("hidden w-px flex-1 md:block", ends ? "bg-transparent" : "bg-zinc-300")} aria-hidden />
    </section>
  );
}

/** A short vertical line, with an optional "+" (add a step here) in the middle. */
function Connector(props: FlowProps & { container: ContainerRef; index: number }) {
  const { readOnly, container, index, insertOptions, onInsert } = props;
  if (readOnly) return <Line className="h-6" />;
  return (
    <div className="flex flex-col items-center">
      <Line className="h-3" />
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Add a step here"
          title="Add a step here"
          // A bigger target on touch screens.
          className="flex size-8 items-center justify-center rounded-full border sm:size-6 border-zinc-300 bg-white text-zinc-500 shadow-xs transition-colors outline-none hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-3 focus-visible:ring-emerald-500/40 data-popup-open:border-emerald-500 data-popup-open:text-emerald-700"
        >
          <Plus className="size-3.5" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-64">
          <DropdownMenuLabel>Add a step</DropdownMenuLabel>
          {insertOptions(container, index).map(({ type, blocker }) => {
            const Icon = STEP_ICONS[type];
            return (
              <DropdownMenuItem key={type} disabled={!!blocker} onClick={() => onInsert(container, index, type)} className="items-start">
                <Glyph icon={Icon} size="sm" tone="current" className={cn("mt-0.5", STEP_TONES[type])} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm">{STEP_LABELS[type]}</span>
                  <span className="text-xs text-zinc-500">{blocker ?? NEW_STEP_HINTS[type]}</span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <Line className="h-3" />
    </div>
  );
}

function Line({ className }: { className?: string }) {
  return <div className={cn("h-4 w-px shrink-0 bg-zinc-300", className)} aria-hidden />;
}

function NodeButton({
  selected,
  onClick,
  className,
  ariaLabel,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={ariaLabel}
      aria-pressed={selected}
      className={cn(
        "flex w-full max-w-sm items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-left shadow-xs transition-all outline-none",
        "hover:border-emerald-300 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-emerald-500/40",
        selected && "border-emerald-500 ring-3 ring-emerald-500/25",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Sentence({ parts }: { parts: Part[] }) {
  return (
    <span className="mt-0.5 line-clamp-2 block text-sm text-zinc-600">
      {parts.map((p, i) => (
        <span key={i} className={cn(p.strong && "font-medium text-zinc-900", p.missing && "text-amber-700")}>
          {p.text}
        </span>
      ))}
    </span>
  );
}
