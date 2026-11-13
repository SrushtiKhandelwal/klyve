"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AI_INPUT_LIMITS } from "@/lib/ai/inputs";
import { AiErrorText, AiNotSetUp } from "./ai-bits";
import { useAiConfigured } from "./use-ai-status";

// The "Describe with AI" box used on the new-segment and new-automation pages:
// a short text box and a button. The page decides what happens with the answer.

export function DescribeWithAiBox({
  id,
  title,
  hint,
  placeholder,
  buttonLabel,
  pending,
  error,
  onSubmit,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  placeholder: string;
  buttonLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (description: string) => void;
  /** Shown under the box (e.g. the AI's note). */
  children?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const configured = useAiConfigured();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (text.trim().length < 5) {
      setTooShort(true);
      return;
    }
    onSubmit(text.trim());
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5">
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <Sparkles className="size-4 text-emerald-600" aria-hidden />
        {title}
      </h2>
      <p className="mt-1 text-xs text-zinc-600">{hint}</p>
      {configured === false ? (
        <AiNotSetUp className="mt-3 bg-white" />
      ) : (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
          <label htmlFor={id} className="sr-only">
            {title}
          </label>
          <Textarea
            id={id}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTooShort(false);
            }}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter makes a new line.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={AI_INPUT_LIMITS.descriptionMax}
            placeholder={placeholder}
            disabled={pending}
            className="min-h-0 flex-1 bg-white"
            aria-invalid={tooShort ? true : undefined}
          />
          <Button type="submit" disabled={pending || configured === null} className="sm:mt-0.5">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {pending ? "Thinking…" : buttonLabel}
          </Button>
        </form>
      )}
      {tooShort && <p className="mt-2 text-xs text-red-600">Describe it in a few words.</p>}
      <AiErrorText message={error} className="mt-3" />
      {children}
    </section>
  );
}
