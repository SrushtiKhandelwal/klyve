"use client";

import { useMemo, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Copy,
  Info,
  Loader2,
  Lock,
  MousePointerClick,
  Pause,
  Play,
  MoreHorizontal,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { activateAutomationAction, duplicateAutomationAction, pauseAutomationAction } from "@/app/actions/automations";
import { Glyph } from "@/components/brand/glyph";
import { SaveIndicator } from "@/components/campaigns/setup/setup-section";
import { BuilderSwitch } from "@/components/forms/builder/builder-switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { findStep, flattenSteps, type AutomationStep, type AutomationTrigger } from "@/lib/automations/schema";
import type { BrandTheme, MergeTag } from "@/lib/templates/document";
import { ActivationProblemsDialog, DeleteAutomationDialog } from "../automation-dialogs";
import { AutomationStatusBadge } from "../automation-status-badge";
import type { Lookups } from "../describe";
import { InlineName } from "./inline-name";
import { DeleteConditionDialog, EnrollDialog, StepTestDialog } from "./builder-dialogs";
import { flaggedStepIds, readinessProblems, saveIssue } from "./checks";
import { Flow, type InsertOption } from "./flow";
import { NEW_STEP_TYPES, createStep, emailsBeforePlace, newStepBlocker, type NewStepType } from "./new-step";
import { StepSettings, TriggerSettings, type SenderOption } from "./step-panel";
import { insertBlocker, insertStep, moveStep, removeStep, updateStep, type ContainerRef } from "./tree";
import { useAutomationAutosave } from "./use-automation-autosave";

export type BuilderAutomation = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  trigger: AutomationTrigger;
  steps: AutomationStep[];
  allowReentry: boolean;
};

/**
 * The visual automation builder: a top bar, the flow chart, and a settings
 * panel for whatever is selected (on phones the panel slides up as a sheet).
 * While the automation is DRAFT or PAUSED every change saves automatically;
 * while it's ACTIVE everything is read-only.
 */
export function AutomationBuilder({
  automation,
  lookups,
  senders,
  theme,
  mergeTags,
  canManage,
  userEmail,
  enrollCap,
  stats,
}: {
  automation: BuilderAutomation;
  lookups: Lookups;
  senders: SenderOption[];
  theme: BrandTheme;
  mergeTags: MergeTag[];
  canManage: boolean;
  userEmail: string;
  enrollCap: number;
  stats?: ReactNode;
}) {
  const router = useRouter();
  const { state: saveState, save, flush, discard } = useAutomationAutosave(automation.id);
  const [trigger, setTrigger] = useState(automation.trigger);
  const [steps, setSteps] = useState(automation.steps);
  const [allowReentry, setAllowReentry] = useState(automation.allowReentry);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Why the latest edit can't be saved yet, or null. */
  const [problem, setProblem] = useState<string | null>(null);
  const [activationIssues, setActivationIssues] = useState<string[] | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [testStepId, setTestStepId] = useState<string | null>(null);
  const [conditionToDelete, setConditionToDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isDesktop = useIsDesktop();

  const status = automation.status;
  const readOnly = status === "ACTIVE";
  const senderIds = useMemo(() => senders.map((s) => s.id), [senders]);
  const problems = useMemo(() => readinessProblems(trigger, steps, lookups, senderIds), [trigger, steps, lookups, senderIds]);
  const flagged = useMemo(() => flaggedStepIds(steps, lookups, senderIds), [steps, lookups, senderIds]);
  const selectedStep = selectedId && selectedId !== "trigger" ? findStep(steps, selectedId) : null;
  const ctx = { theme, defaultSenderId: senders[0]?.id ?? null, lookups };

  // ── Editing (every change goes through these two, so it's checked + saved) ──

  function applySteps(next: AutomationStep[]) {
    if (readOnly) return;
    setSteps(next);
    const issue = saveIssue(trigger, next);
    setProblem(issue);
    if (issue) discard("steps");
    else save({ steps: next });
  }

  function applyTrigger(next: AutomationTrigger) {
    if (readOnly) return;
    setTrigger(next);
    const issue = saveIssue(next, steps);
    setProblem(issue);
    if (issue) discard("trigger");
    else save({ trigger: next, steps }, 300);
  }

  function insertOptions(ref: ContainerRef, index: number): InsertOption[] {
    const emailsAbove = emailsBeforePlace(steps, ref, index).length;
    return NEW_STEP_TYPES.map((type) => ({
      type,
      blocker: insertBlocker(steps, ref, type) ?? newStepBlocker(type, ctx, emailsAbove),
    }));
  }

  function handleInsert(ref: ContainerRef, index: number, type: NewStepType) {
    const emailCount = flattenSteps(steps).filter((s) => s.type === "send_email").length;
    const step = createStep(type, ctx, emailsBeforePlace(steps, ref, index), emailCount);
    if (!step) return;
    applySteps(insertStep(steps, ref, index, step));
    setSelectedId(step.id); // open its settings straight away
  }

  function handleDelete(stepId: string) {
    const step = findStep(steps, stepId);
    if (!step) return;
    if (step.type === "condition" && step.yes.length + step.no.length > 0) return setConditionToDelete(stepId);
    deleteWithUndo(stepId, "none");
  }

  function deleteWithUndo(stepId: string, keep: "none" | "yes" | "no") {
    const before = steps;
    applySteps(removeStep(steps, stepId, keep));
    setSelectedId(null);
    toast.success("Step deleted.", { action: { label: "Undo", onClick: () => applySteps(before) } });
  }

  // ── Leaving for the email editor / tests: save first ──

  async function saveNow(): Promise<boolean> {
    if (readOnly) return true;
    if (problem) {
      toast.error(`Not saved yet: ${problem}`);
      return false;
    }
    const ok = await flush();
    if (!ok) toast.error("Couldn't save your latest changes. Please try again.");
    return ok;
  }

  function editDesign(stepId: string) {
    startTransition(async () => {
      if (await saveNow()) router.push(`/automations/${automation.id}/email/${stepId}`);
    });
  }

  // ── On / off ──

  function activate() {
    startTransition(async () => {
      try {
        if (problem) return setActivationIssues([problem]);
        if (!(await flush())) return void toast.error("Couldn't save your latest changes, so it wasn't turned on.");
        const result = await activateAutomationAction(automation.id);
        if (result.ok) return void toast.success("It's on! New people will go through it automatically.");
        if (result.problems?.length) return setActivationIssues(result.problems);
        toast.error(result.error ?? "Couldn't turn it on.");
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  function pause() {
    startTransition(async () => {
      try {
        const result = await pauseAutomationAction(automation.id);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Paused. You can edit it now; people already in it keep their place.");
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  function duplicate() {
    startTransition(async () => {
      try {
        if (!(await saveNow())) return;
        const result = await duplicateAutomationAction(automation.id);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Copied as a new draft.");
        router.push(`/automations/${result.automationId}`);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  // ── Panel ──

  const panel =
    selectedId === "trigger" ? (
      <TriggerSettings trigger={trigger} lookups={lookups} readOnly={readOnly} onChange={applyTrigger} />
    ) : selectedStep ? (
      <StepSettings
        // A fresh panel per step, so typed-but-invalid numbers don't carry over.
        key={selectedStep.id}
        step={selectedStep}
        steps={steps}
        lookups={lookups}
        senders={senders}
        mergeTags={mergeTags}
        readOnly={readOnly}
        onChange={(updater) => applySteps(updateStep(steps, selectedStep.id, updater))}
        onMove={(direction) => applySteps(moveStep(steps, selectedStep.id, direction))}
        onDelete={() => handleDelete(selectedStep.id)}
        onEditDesign={() => editDesign(selectedStep.id)}
        onSendTest={() => setTestStepId(selectedStep.id)}
      />
    ) : null;

  const conditionStep = conditionToDelete ? findStep(steps, conditionToDelete) : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      {/* ── Top bar ── */}
      <header className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href="/automations"
            aria-label="Back to automations"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <InlineName automationId={automation.id} initialName={automation.name} />
          <AutomationStatusBadge status={status} />
          <span className="basis-full pl-10 sm:ml-auto sm:basis-auto sm:pl-0">
            {readOnly ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                <Lock className="size-3.5" aria-hidden />
                Read-only while it&apos;s on
              </span>
            ) : problem ? (
              <span role="alert" className="inline-flex items-center gap-1.5 text-xs text-amber-700">
                <CircleAlert className="size-3.5" aria-hidden />
                Not saved yet: {problem}
              </span>
            ) : (
              <SaveIndicator state={saveState} onRetry={() => void flush()} />
            )}
          </span>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border bg-white p-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <BuilderSwitch
              label="Let people go through it more than once"
              description={
                trigger.type === "date_anniversary"
                  ? "Date triggers always run once a year per person."
                  : "Off: each person goes through once, ever. On: they start again every time the trigger happens (after finishing)."
              }
              checked={allowReentry}
              disabled={readOnly}
              onCheckedChange={(checked) => {
                setAllowReentry(checked);
                save({ allowReentry: checked }, 0);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setEnrollOpen(true)}
              disabled={status !== "ACTIVE"}
              title={status === "ACTIVE" ? "Put a list or segment through it now" : "Turn it on first, then add people"}
            >
              <UserPlus aria-hidden />
              Add people
            </Button>
            {status === "ACTIVE" ? (
              <Button variant="outline" onClick={pause} disabled={!canManage || pending} title={canManage ? undefined : "Only owners and admins can pause"}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Pause aria-hidden />}
                Pause
              </Button>
            ) : (
              <Button onClick={activate} disabled={!canManage || pending} title={canManage ? undefined : "Only owners and admins can turn it on"}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
                {status === "PAUSED" ? "Resume" : "Activate"}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More actions" />}>
                <MoreHorizontal aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={duplicate}>
                  <Copy aria-hidden />
                  Duplicate
                </DropdownMenuItem>
                {canManage && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                      <Trash2 aria-hidden />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {readOnly && (
          <div className="flex flex-col gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-600/15 sm:flex-row sm:items-center">
            <Lock className="hidden size-4 shrink-0 text-emerald-700 sm:block" aria-hidden />
            <p className="flex-1">
              <strong>This automation is on.</strong> Pause to edit. People already in the automation keep their place.
            </p>
          </div>
        )}
        {!canManage && status !== "ACTIVE" && (
          <p className="text-xs text-zinc-500">You can edit this draft. A workspace owner or admin turns it on.</p>
        )}
      </header>

      {/* Phones: the checklist sits above the flow (no side panel there). */}
      {!readOnly && (
        <div className="lg:hidden">
          <Checklist problems={problems} />
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* ── Flow chart ── */}
        <div className="min-w-0 rounded-2xl border bg-zinc-50/70 bg-[radial-gradient(#e4e4e7_1px,transparent_1px)] [background-size:18px_18px] p-3 sm:p-6">
          <Flow
            trigger={trigger}
            steps={steps}
            lookups={lookups}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId((current) => (current === id && isDesktop ? null : id))}
            readOnly={readOnly}
            flagged={flagged}
            insertOptions={insertOptions}
            onInsert={handleInsert}
          />
        </div>

        {/* ── Settings panel (desktop) ── */}
        <aside className="hidden min-w-0 rounded-2xl border bg-white p-4 lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
          {panel ?? <Overview problems={problems} readOnly={readOnly} />}
        </aside>
      </div>

      {/* Phones/tablets: the same panel as a sheet from the bottom. */}
      <Dialog open={!isDesktop && panel !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="top-auto bottom-0 left-0 max-h-[88dvh] max-w-full translate-x-0 translate-y-0 overflow-y-auto rounded-t-2xl rounded-b-none p-4 pb-8 sm:max-w-full">
          <DialogTitle className="sr-only">Step settings</DialogTitle>
          {panel}
        </DialogContent>
      </Dialog>

      {/* Engineer C's stats panel brings its own heading. */}
      {stats && <div className="min-w-0">{stats}</div>}

      <ActivationProblemsDialog problems={activationIssues} onOpenChange={(open) => !open && setActivationIssues(null)} />
      <DeleteAutomationDialog
        automationId={automation.id}
        name={automation.name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push("/automations")}
      />
      <EnrollDialog automationId={automation.id} lookups={lookups} cap={enrollCap} open={enrollOpen} onOpenChange={setEnrollOpen} />
      <StepTestDialog
        automationId={automation.id}
        stepId={testStepId}
        defaultSenderId={testStepId ? (() => {
          const s = findStep(steps, testStepId);
          return s?.type === "send_email" ? s.senderId : null;
        })() : null}
        senders={senders}
        defaultTo={userEmail}
        beforeSend={saveNow}
        onOpenChange={(open) => !open && setTestStepId(null)}
      />
      <DeleteConditionDialog
        open={conditionStep?.type === "condition"}
        yesCount={conditionStep?.type === "condition" ? flattenSteps(conditionStep.yes).length : 0}
        noCount={conditionStep?.type === "condition" ? flattenSteps(conditionStep.no).length : 0}
        onOpenChange={(open) => !open && setConditionToDelete(null)}
        onConfirm={(keep) => {
          if (conditionToDelete) deleteWithUndo(conditionToDelete, keep);
          setConditionToDelete(null);
        }}
      />
    </div>
  );
}

/** The side panel when nothing is selected: how to use the builder + the checklist. */
function Overview({ problems, readOnly }: { problems: string[]; readOnly: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Glyph icon={MousePointerClick} className="mt-0.5" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-zinc-900">{readOnly ? "How it works" : "Build your workflow"}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {readOnly
              ? "Click any step to see its settings."
              : "Click the trigger or a step to change it. Use the + buttons to add steps anywhere."}
          </p>
        </div>
      </div>
      {!readOnly && <Checklist problems={problems} />}
      <div className="flex gap-2 rounded-lg bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600 ring-1 ring-zinc-200">
        <Info className="mt-0.5 size-3.5 shrink-0 text-zinc-400" aria-hidden />
        <p>
          Contacts who unsubscribe, bounce or complain leave every automation automatically. Emails always include your
          unsubscribe link.
        </p>
      </div>
    </div>
  );
}

/** The live "ready to turn on?" list. */
function Checklist({ problems }: { problems: string[] }) {
  if (problems.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-600/15">
        <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
        Ready to turn on.
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-amber-50/70 px-3 py-3 ring-1 ring-amber-600/15">
      <p className="text-sm font-medium text-amber-900">
        {problems.length === 1 ? "1 thing" : `${problems.length} things`} to fix before turning it on
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {problems.map((p) => (
          <li key={p} className="flex gap-2 text-xs text-amber-900">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DESKTOP_QUERY = "(min-width: 1024px)";

/** true on wide screens (side panel), false on phones/tablets (bottom sheet). */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(DESKTOP_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    // The server can't know the screen size; it renders the desktop layout.
    () => true,
  );
}
