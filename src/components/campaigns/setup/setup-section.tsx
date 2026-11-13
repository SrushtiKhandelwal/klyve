"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, CloudAlert, Loader2 } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SaveState } from "./use-draft-autosave";

/**
 * One step of the setup checklist (Brevo-style): a status icon, a title, a
 * one-line summary of what's chosen, and an Edit button that opens the form
 * underneath. Changes inside save automatically.
 */
export function SetupSection({
  id,
  icon: Icon,
  title,
  done,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  done: boolean;
  summary: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = `${id}-panel`;
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-6 rounded-xl border bg-white transition-shadow", open && "shadow-sm ring-1 ring-emerald-500/20")}
    >
      <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
        {/* Bare icon: Klyve green when done, amber while it still needs something. */}
        <Glyph
          icon={Icon}
          tone={done ? "brand" : "current"}
          className={cn("mt-0.5", !done && "text-amber-600")}
        />
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-zinc-900">
            {title}
            {done ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <CircleCheck className="size-3.5" aria-hidden />
                Done
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                <CircleAlert className="size-3.5" aria-hidden />
                Needs attention
              </span>
            )}
          </h2>
          <div className="mt-0.5 text-sm break-words text-zinc-500">{summary}</div>
        </div>
        <Button
          type="button"
          variant={open ? "secondary" : "outline"}
          size="sm"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="shrink-0"
        >
          {open ? "Close" : done ? "Edit" : "Set up"}
        </Button>
      </div>
      {open && (
        <div id={panelId} className="border-t px-4 py-5 sm:px-5">
          {children}
        </div>
      )}
    </section>
  );
}

/** "Saving…", "All changes saved", or the save error with a Retry button. */
export function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state.kind === "saving") {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Saving…
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <span role="alert" className="inline-flex flex-wrap items-center gap-1.5 text-xs text-red-600">
        <CloudAlert className="size-3.5" aria-hidden />
        {state.message}
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
          Retry
        </button>
      </span>
    );
  }
  if (state.kind === "saved") {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
        <CircleCheck className="size-3.5 text-emerald-600" aria-hidden />
        All changes saved
      </span>
    );
  }
  return <span className="text-xs text-zinc-400">Changes save automatically</span>;
}
