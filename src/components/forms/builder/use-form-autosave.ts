"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveFormAction } from "@/app/actions/forms";
import type { FormConfig } from "@/lib/forms/schema";

// Autosave for the form builder (same idea as the campaign setup page).
//
// Every change calls save({ part: value }). Changes are collected for a short
// moment (so typing a title doesn't send one request per key) and then
// written in ONE call to saveFormAction. Saves never overlap: they run one
// after another, so an older value can't overwrite a newer one. If a save
// fails, the unsaved parts are kept and retried with the next save.

export type FormPatch = {
  name?: string;
  config?: FormConfig;
  listIds?: string[];
  status?: "ACTIVE" | "PAUSED";
};

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

const DEFAULT_DELAY_MS = 700;

export function useFormAutosave(formId: string) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  const pending = useRef<FormPatch>({});
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
        const result = await saveFormAction(formId, patch);
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
  }, [formId]);

  /** Queues changes; they're saved after `delayMs` without further changes. */
  const save = useCallback(
    (patch: FormPatch, delayMs = DEFAULT_DELAY_MS) => {
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [flush],
  );

  // Warn before closing the tab while something isn't saved yet.
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (hasPending()) event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Leaving the page inside the app (e.g. back to Forms): save what's waiting.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (hasPending()) void flush();
    },
    [flush],
  );

  return { state, save, flush };
}
