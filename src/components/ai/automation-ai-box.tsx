"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { describeAutomationAction } from "@/app/actions/ai";
import { buttonVariants } from "@/components/ui/button";
import type { AutomationSuggestion } from "@/lib/ai/features/automation";
import { cn } from "@/lib/utils";
import { OFFLINE_MESSAGE } from "./ai-bits";
import { DescribeWithAiBox } from "./describe-box";

// "Describe with AI" on /automations/new. The AI picks the ready-made recipe
// that fits best and its setting (which list, form or date field). The user
// then continues in the normal recipe flow with those values filled in, and
// still has to click "Create automation" (it's created as a draft).

/** The confirm page's address, with the AI's choices filled in. */
export function aiRecipeHref(s: Extract<AutomationSuggestion, { fit: true }>): string {
  const params = new URLSearchParams({ recipe: s.recipeId, ai: "1", name: s.name });
  if (s.setting?.value) params.set("setting", s.setting.value);
  return `/automations/new?${params.toString()}`;
}

export function AutomationAiBox() {
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<AutomationSuggestion | null>(null);
  const [pending, startTransition] = useTransition();

  function describe(description: string) {
    setError(null);
    setSuggestion(null);
    startTransition(async () => {
      try {
        const answer = await describeAutomationAction(description);
        if (answer.ok) setSuggestion(answer.suggestion);
        else setError(answer.error);
      } catch {
        setError(OFFLINE_MESSAGE);
      }
    });
  }

  return (
    <DescribeWithAiBox
      id="automation-ai"
      title="Describe with AI"
      hint="Say what should happen, and AI picks the best ready-made automation and fills in its settings. Nothing is created until you confirm."
      placeholder="e.g. Welcome people who join my Newsletter list, and send a gift a few days later"
      buttonLabel="Find automation"
      pending={pending}
      error={error}
      onSubmit={describe}
    >
      {suggestion && (
        <div role="status" className="mt-3 flex flex-col gap-3 rounded-lg border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          {suggestion.fit ? (
            <>
              <div className="min-w-0 text-sm">
                <p className="font-medium text-zinc-900">Best match: {suggestion.recipeName}</p>
                {suggestion.reason && <p className="mt-0.5 text-zinc-600">{suggestion.reason}</p>}
              </div>
              <Link href={aiRecipeHref(suggestion)} className={cn(buttonVariants(), "shrink-0")}>
                Continue
                <ArrowRight aria-hidden />
              </Link>
            </>
          ) : (
            <>
              <div className="min-w-0 text-sm">
                <p className="font-medium text-zinc-900">None of the ready-made automations fits exactly.</p>
                <p className="mt-0.5 text-zinc-600">
                  {suggestion.reason}
                  {suggestion.closest && <> The closest is &quot;{suggestion.closest.name}&quot;.</>}
                </p>
              </div>
              {suggestion.closest ? (
                <Link
                  href={`/automations/new?recipe=${encodeURIComponent(suggestion.closest.id)}`}
                  className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
                >
                  See {suggestion.closest.name}
                  <ArrowRight aria-hidden />
                </Link>
              ) : null}
            </>
          )}
        </div>
      )}
    </DescribeWithAiBox>
  );
}
