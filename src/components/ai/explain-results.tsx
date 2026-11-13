"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { explainReportAction } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import type { Explanation } from "@/lib/ai/features/explain";
import { AiErrorText, AiNotSetUp, OFFLINE_MESSAGE } from "./ai-bits";
import { useAiConfigured } from "./use-ai-status";

// "Explain my results" on a campaign report: a short plain-English summary
// and 3 suggestions. The AI only sees totals (sent, opens, clicks, bounces…),
// the send time and the most-clicked web addresses, never anyone's details.

export function useExplainResults(campaignId: string) {
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const configured = useAiConfigured(open);

  function request() {
    setOpen(true);
    setError(null);
    startTransition(async () => {
      try {
        const result = await explainReportAction(campaignId);
        if (result.ok) setExplanation({ summary: result.summary, suggestions: result.suggestions });
        else setError(result.error);
      } catch {
        setError(OFFLINE_MESSAGE);
      }
    });
  }

  return { open, close: () => setOpen(false), explanation, error, pending, configured, request };
}

export type ExplainState = ReturnType<typeof useExplainResults>;

export function ExplainResultsButton({ state }: { state: ExplainState }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={state.request} disabled={state.pending}>
      {state.pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles className="text-emerald-600" aria-hidden />}
      {state.explanation ? "Explain again" : "Explain my results"}
    </Button>
  );
}

export function ExplainResultsPanel({ state }: { state: ExplainState }) {
  if (!state.open) return null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          <Sparkles className="size-4 text-emerald-600" aria-hidden />
          What your results mean
        </h3>
        <button type="button" onClick={state.close} aria-label="Hide explanation" className="rounded p-1 text-zinc-400 hover:bg-white hover:text-zinc-700">
          <X className="size-4" />
        </button>
      </div>
      {state.configured === false ? (
        <AiNotSetUp className="bg-white" />
      ) : state.pending && !state.explanation ? (
        <p className="flex items-center gap-2 text-sm text-zinc-600">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Looking at your numbers…
        </p>
      ) : (
        <>
          <AiErrorText message={state.error} />
          {state.explanation && (
            <>
              <p className="text-sm text-zinc-800">{state.explanation.summary}</p>
              <div>
                <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Try next time</p>
                <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-5 text-sm text-zinc-800 marker:text-emerald-700">
                  {state.explanation.suggestions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
              <p className="text-xs text-zinc-500">Written by AI from your campaign&apos;s totals only. Opens are an estimate.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
