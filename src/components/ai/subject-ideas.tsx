"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { suggestSubjectsAction } from "@/app/actions/ai";
import { AiErrorText, AiNotSetUp, OFFLINE_MESSAGE } from "./ai-bits";
import { useAiConfigured } from "./use-ai-status";

// "Suggest with AI" for the campaign's subject line: 5 ideas and a preview
// text, written from what the email says right now (its saved design).
// Clicking an idea fills the field; nothing is saved until the normal
// autosave picks up the change.

type Ideas = { subjects: string[]; preheader: string };

export function useSubjectIdeas(campaignId: string | undefined) {
  const [open, setOpen] = useState(false);
  const [ideas, setIdeas] = useState<Ideas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const configured = useAiConfigured(open);

  function request() {
    if (!campaignId) return;
    setOpen(true);
    setError(null);
    startTransition(async () => {
      try {
        const result = await suggestSubjectsAction(campaignId);
        if (result.ok) setIdeas({ subjects: result.subjects, preheader: result.preheader });
        else setError(result.error);
      } catch {
        setError(OFFLINE_MESSAGE);
      }
    });
  }

  return { enabled: !!campaignId, open, close: () => setOpen(false), ideas, error, pending, configured, request };
}

export type SubjectIdeasState = ReturnType<typeof useSubjectIdeas>;

/** The small "Suggest with AI" button next to the subject label. */
export function SubjectIdeasButton({ state }: { state: SubjectIdeasState }) {
  if (!state.enabled) return null;
  return (
    <button
      type="button"
      onClick={state.request}
      disabled={state.pending}
      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
    >
      {state.pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
      {state.ideas ? "More ideas" : "Suggest with AI"}
    </button>
  );
}

/** The list of ideas under the subject field. */
export function SubjectIdeasPanel({
  state,
  currentSubject,
  currentPreheader,
  onPickSubject,
  onPickPreheader,
}: {
  state: SubjectIdeasState;
  currentSubject: string;
  currentPreheader: string;
  onPickSubject: (v: string) => void;
  onPickPreheader: (v: string) => void;
}) {
  if (!state.open) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-white p-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-700">
          <Sparkles className="size-3.5 text-emerald-600" aria-hidden />
          Subject line ideas
        </p>
        <button type="button" onClick={state.close} aria-label="Hide ideas" className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
          <X className="size-3.5" />
        </button>
      </div>

      {state.configured === false ? (
        <AiNotSetUp />
      ) : state.pending && !state.ideas ? (
        <p className="flex items-center gap-2 py-2 text-sm text-zinc-500">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Reading your email and writing ideas…
        </p>
      ) : (
        <>
          <AiErrorText message={state.error} />
          {state.ideas && (
            <>
              <ul className="flex flex-col divide-y rounded-md border">
                {state.ideas.subjects.map((s) => {
                  const chosen = s === currentSubject;
                  return (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => onPickSubject(s)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-emerald-50/60 focus-visible:bg-emerald-50/60 focus-visible:outline-none"
                      >
                        <span className="min-w-0 flex-1 break-words">{s}</span>
                        {chosen ? (
                          <Check className="size-4 shrink-0 text-emerald-600" aria-label="In use" />
                        ) : (
                          <span className="shrink-0 text-xs font-medium text-emerald-700">Use</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {state.ideas.preheader && (
                <div className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-zinc-50 px-3 py-2 text-sm">
                  <p className="min-w-0 flex-1 text-zinc-600">
                    <span className="font-medium text-zinc-800">Preview text: </span>
                    {state.ideas.preheader}
                  </p>
                  <button
                    type="button"
                    onClick={() => state.ideas && onPickPreheader(state.ideas.preheader)}
                    disabled={state.ideas.preheader === currentPreheader}
                    className="shrink-0 text-xs font-medium text-emerald-700 hover:underline disabled:text-zinc-400 disabled:no-underline"
                  >
                    {state.ideas.preheader === currentPreheader ? "In use" : "Use as preview text"}
                  </button>
                </div>
              )}
              <p className="text-xs text-zinc-500">Ideas come from your email&apos;s current content. Check them before sending.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
