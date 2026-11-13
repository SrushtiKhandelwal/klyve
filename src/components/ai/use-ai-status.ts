"use client";

import { useEffect, useState } from "react";
import { getAiStatusAction } from "@/app/actions/ai";

// "Is AI set up on this server?" for the AI buttons, asked once per page load
// and shared by every AI button on the page. Only true/false comes back:
// the key itself never reaches the browser.

let cached: Promise<boolean> | null = null;

function loadStatus(): Promise<boolean> {
  cached ??= getAiStatusAction()
    .then((r) => r.configured)
    .catch(() => {
      // Couldn't ask (offline…): try again next time, and let the action
      // itself say what's wrong if the user goes ahead.
      cached = null;
      return true;
    });
  return cached;
}

/** null while we don't know yet. Pass `active = false` to wait (e.g. until a dialog opens). */
export function useAiConfigured(active = true): boolean | null {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void loadStatus().then((value) => {
      if (alive) setConfigured(value);
    });
    return () => {
      alive = false;
    };
  }, [active]);
  return configured;
}
