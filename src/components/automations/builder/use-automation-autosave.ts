"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveAutomationAction } from "@/app/actions/automations";
import type { AutomationStep, AutomationTrigger } from "@/lib/automations/schema";

// Autosave for the automation builder (same idea as the form builder's).
//
// Every change calls save({ part: value }). Changes are collected for a short
// moment (so typing a subject doesn't send one request per key) and then
// written in ONE call. Saves never overlap: they run one after another, so an
// older version can't overwrite a newer one. If a save fails, the unsaved
// parts are kept and retried with the next save.

export type AutomationPatch = {
  trigger?: AutomationTrigger;
  steps?: AutomationStep[];
  allowReentry?: boolean;
};

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

const DEFAULT_DELAY_MS = 800;

export function useAutomationAutosave(automationId: string) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  const pending = useRef<AutomationPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));

  const hasPending = () => Object.keys(pending.current).length > 0;

  /** Writes whatever is waiting now. Resolves true when everything is saved. */
  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    chain.current = chain.current.then(async () => {
      if (!hasPending()) return true;
      const patch = pending.current;
      pending.current = {};
      setState({ kind: "saving" });
      try {
        const result = await saveAutomationAction(automationId, patch);
        if (!result.ok) {
          // Keep the failed parts (unless the user changed them again meanwhile).
          pending.current = { ...patch, ...pending.current };
          setState({ kind: "error", message: result.error });
          return false;
        }
        if (hasPending()) return true; // more changes arrived; the next save reports
        setState({ kind: "saved", at: Date.now() });
        return true;
      } catch {
        pending.current = { ...patch, ...pending.current };
        setState({ kind: "error", message: "Couldn't reach the server. Your last changes aren't saved yet." });
        return false;
      }
    });
    return chain.current;
  }, [automationId]);

  /** Queues changes; they're saved after `delayMs` without further changes. */
  const save = useCallback(
    (patch: AutomationPatch, delayMs = DEFAULT_DELAY_MS) => {
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [flush],
  );

  /** Forgets queued changes (e.g. a step that's being edited is invalid again). */
  const discard = useCallback((part: keyof AutomationPatch) => {
    const next = { ...pending.current };
    delete next[part];
    pending.current = next;
  }, []);

  // Warn before closing the tab while something isn't saved yet.
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (hasPending()) event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Leaving the page inside the app: save what's waiting.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (hasPending()) void flush();
    },
    [flush],
  );

  return { state, save, flush, discard, hasPending };
}
