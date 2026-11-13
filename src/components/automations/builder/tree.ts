// Pure helpers for editing the automation's step TREE (no React, no server).
// Every function returns a NEW array and never changes its input, so the
// builder can keep the old version for undo-like safety and React notices
// every change.
//
// A "place" in the tree is a container plus an index:
//   { conditionId: null }                    → the main path
//   { conditionId: "st_abc", branch: "yes" } → the "If yes" side of that if/else
import {
  MAX_DEPTH,
  MAX_STEPS,
  flattenSteps,
  type AutomationStep,
  type ConditionStep,
  type SendEmailStep,
} from "@/lib/automations/schema";

export type ContainerRef = { conditionId: null } | { conditionId: string; branch: "yes" | "no" };

export const ROOT: ContainerRef = { conditionId: null };

/** Most steps in one list (same as the schema's .max(30)). */
export const MAX_PER_BRANCH = 30;

export function sameContainer(a: ContainerRef, b: ContainerRef): boolean {
  if (a.conditionId === null || b.conditionId === null) return a.conditionId === b.conditionId;
  return a.conditionId === b.conditionId && a.branch === b.branch;
}

/** The step list behind a container ref, or null if the condition is gone. */
export function getContainer(steps: AutomationStep[], ref: ContainerRef): AutomationStep[] | null {
  if (ref.conditionId === null) return steps;
  const cond = flattenSteps(steps).find((s) => s.id === ref.conditionId);
  if (!cond || cond.type !== "condition") return null;
  return ref.branch === "yes" ? cond.yes : cond.no;
}

/** Rebuilds the tree with one container's list replaced. */
function replaceContainer(
  steps: AutomationStep[],
  ref: ContainerRef,
  update: (list: AutomationStep[]) => AutomationStep[],
): AutomationStep[] {
  if (ref.conditionId === null) return update(steps);
  const walk = (list: AutomationStep[]): AutomationStep[] =>
    list.map((s) => {
      if (s.type !== "condition") return s;
      if (s.id === ref.conditionId) {
        return ref.branch === "yes" ? { ...s, yes: update(s.yes) } : { ...s, no: update(s.no) };
      }
      return { ...s, yes: walk(s.yes), no: walk(s.no) };
    });
  return walk(steps);
}

export type StepLocation = {
  container: ContainerRef;
  index: number;
  /** 1 = main path, 2 = inside one if/else, … */
  depth: number;
  /** How many steps share its list (for "move down"). */
  siblings: number;
};

/** Where a step sits in the tree, or null if it isn't there. */
export function locateStep(steps: AutomationStep[], stepId: string): StepLocation | null {
  const search = (list: AutomationStep[], container: ContainerRef, depth: number): StepLocation | null => {
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.id === stepId) return { container, index: i, depth, siblings: list.length };
      if (s.type === "condition") {
        const found =
          search(s.yes, { conditionId: s.id, branch: "yes" }, depth + 1) ??
          search(s.no, { conditionId: s.id, branch: "no" }, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return search(steps, ROOT, 1);
}

/** How deep a container's steps sit (1 = main path). */
export function containerDepth(steps: AutomationStep[], ref: ContainerRef): number {
  if (ref.conditionId === null) return 1;
  const loc = locateStep(steps, ref.conditionId);
  return loc ? loc.depth + 1 : 1;
}

/** Steps in a subtree, counting the step itself (an if/else counts its branches too). */
export function subtreeSize(step: AutomationStep): number {
  return step.type === "condition" ? 1 + flattenSteps(step.yes).length + flattenSteps(step.no).length : 1;
}

/** Why a step of this type can't be added here, or null when it can. */
export function insertBlocker(steps: AutomationStep[], ref: ContainerRef, type: AutomationStep["type"]): string | null {
  const list = getContainer(steps, ref);
  if (!list) return "That branch no longer exists.";
  if (flattenSteps(steps).length >= MAX_STEPS) return `An automation can have at most ${MAX_STEPS} steps.`;
  if (list.length >= MAX_PER_BRANCH) return `A path can have at most ${MAX_PER_BRANCH} steps.`;
  if (type === "condition" && containerDepth(steps, ref) >= MAX_DEPTH) {
    return `If/else steps can be nested at most ${MAX_DEPTH} deep.`;
  }
  return null;
}

/** Puts `step` at `index` in the container (clamped to the list's ends). */
export function insertStep(steps: AutomationStep[], ref: ContainerRef, index: number, step: AutomationStep): AutomationStep[] {
  return replaceContainer(steps, ref, (list) => {
    const at = Math.max(0, Math.min(index, list.length));
    return [...list.slice(0, at), step, ...list.slice(at)];
  });
}

/**
 * Removes a step. For an if/else, `keep` decides what happens to its branches:
 *   "none" → everything inside goes too
 *   "yes"  → the "If yes" steps move up into its place (the "no" ones go)
 *   "no"   → the same with the "If no" steps
 */
export function removeStep(steps: AutomationStep[], stepId: string, keep: "none" | "yes" | "no" = "none"): AutomationStep[] {
  const loc = locateStep(steps, stepId);
  if (!loc) return steps;
  return replaceContainer(steps, loc.container, (list) => {
    const target = list[loc.index];
    const lifted = target?.type === "condition" && keep !== "none" ? (keep === "yes" ? target.yes : target.no) : [];
    return [...list.slice(0, loc.index), ...lifted, ...list.slice(loc.index + 1)];
  });
}

/** Moves a step one place up (-1) or down (+1) inside its own list. No-op at the ends. */
export function moveStep(steps: AutomationStep[], stepId: string, direction: -1 | 1): AutomationStep[] {
  const loc = locateStep(steps, stepId);
  if (!loc) return steps;
  const to = loc.index + direction;
  if (to < 0 || to >= loc.siblings) return steps;
  return replaceContainer(steps, loc.container, (list) => {
    const next = [...list];
    [next[loc.index], next[to]] = [next[to], next[loc.index]];
    return next;
  });
}

/** Replaces one step (found by id anywhere in the tree) with `updater(step)`. */
export function updateStep(
  steps: AutomationStep[],
  stepId: string,
  updater: (step: AutomationStep) => AutomationStep,
): AutomationStep[] {
  const walk = (list: AutomationStep[]): AutomationStep[] =>
    list.map((s) => {
      if (s.id === stepId) return updater(s);
      if (s.type === "condition") return { ...s, yes: walk(s.yes), no: walk(s.no) };
      return s;
    });
  return walk(steps);
}

/**
 * "Send email" steps that a person at `stepId` has definitely passed: earlier
 * steps in the same list, then earlier steps around each enclosing if/else,
 * outwards to the main path. Emails inside OTHER branches don't count (that
 * person may never have received them). Nearest first.
 */
export function emailStepsAbove(steps: AutomationStep[], stepId: string): SendEmailStep[] {
  const found: SendEmailStep[] = [];
  let currentId: string | null = stepId;
  while (currentId) {
    const loc = locateStep(steps, currentId);
    if (!loc) break;
    const list = getContainer(steps, loc.container) ?? [];
    for (let i = loc.index - 1; i >= 0; i--) {
      const s = list[i];
      if (s.type === "send_email") found.push(s);
    }
    currentId = loc.container.conditionId;
  }
  return found;
}

/** Problems with the TREE's shape the schema can't see (shown as a checklist). */
export function structureProblems(steps: AutomationStep[]): string[] {
  const problems: string[] = [];
  const walk = (list: AutomationStep[]) => {
    const exitAt = list.findIndex((s) => s.type === "exit");
    if (exitAt !== -1 && exitAt < list.length - 1) problems.push("Some steps come after an “Exit” step, so they never run.");
    for (const s of list) {
      if (s.type === "condition") {
        if (s.condition.kind === "email_activity") {
          const ref = s.condition.stepId;
          const exists = flattenSteps(steps).some((x) => x.id === ref);
          if (exists && !emailStepsAbove(steps, s.id).some((e) => e.id === ref)) {
            problems.push("An if/else step checks an email that comes after it (or on another path). Move the email above it.");
          }
        }
        walk(s.yes);
        walk(s.no);
      }
    }
  };
  walk(steps);
  return [...new Set(problems)];
}

/** Conditions whose "email_activity" points at `emailStepId` (to warn before deleting it). */
export function conditionsUsingEmail(steps: AutomationStep[], emailStepId: string): ConditionStep[] {
  return flattenSteps(steps).filter(
    (s): s is ConditionStep => s.type === "condition" && s.condition.kind === "email_activity" && s.condition.stepId === emailStepId,
  );
}
