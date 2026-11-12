"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { updateCampaignDraftAction } from "@/app/actions/campaigns";
import type { Audience } from "@/lib/campaigns/audience";

// Autosave for the campaign setup page.
//
// Every section calls save({ field: value }). Changes are collected for a
// short moment (so typing a subject doesn't send one request per key) and
// then written in ONE call to updateCampaignDraftAction. Saves never overlap:
// they run one after another, so an older value can't overwrite a newer one.
// If a save fails, the unsaved fields are kept and retried on the next save.

export type DraftPatch = {
  name?: string;
  subject?: string;
  preheader?: string;
  senderId?: string | null;
  audience?: Audience;
};

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

const DEFAULT_DELAY_MS = 700;

export function useDraftAutosave(campaignId: string) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  /** Goes up by one after every successful save (the checks re-run on it). */
  const [savedVersion, setSavedVersion] = useState(0);

  const pending = useRef<DraftPatch>({});
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
        const result = await updateCampaignDraftAction(campaignId, patch);
        if (!result.ok) {
          // Keep the failed fields (unless the user changed them again meanwhile).
          pending.current = { ...patch, ...pending.current };
          setState({ kind: "error", message: result.error });
          return false;
        }
        if (hasPending()) return true; // more changes arrived; the next save reports
        setState({ kind: "saved", at: Date.now() });
        setSavedVersion((v) => v + 1);
        return true;
      } catch {
        pending.current = { ...patch, ...pending.current };
        setState({ kind: "error", message: "Couldn't reach the server. Your last changes aren't saved yet." });
        return false;
      }
    });
    return chain.current;
  }, [campaignId]);

  /** Queues changes; they're saved after `delayMs` without further changes. */
  const save = useCallback(
    (patch: DraftPatch, delayMs = DEFAULT_DELAY_MS) => {
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

  // Leaving the page inside the app (e.g. "Edit design"): save what's waiting.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (hasPending()) void flush();
    },
    [flush],
  );

  return { state, save, flush, savedVersion };
}
