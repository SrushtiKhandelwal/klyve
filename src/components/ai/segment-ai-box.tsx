"use client";

import { useState, useTransition } from "react";
import { describeSegmentAction } from "@/app/actions/ai";
import type { SegmentSuggestion } from "@/lib/ai/features/segment";
import { OFFLINE_MESSAGE } from "./ai-bits";
import { DescribeWithAiBox } from "./describe-box";

// "Describe with AI" on the new-segment page. The AI's conditions (already
// checked on the server against this workspace's fields and lists) fill the
// builder below; the user reviews them and clicks "Create segment" as usual.

export function SegmentAiBox({ onApply }: { onApply: (suggestion: SegmentSuggestion) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number; note: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function describe(description: string) {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const answer = await describeSegmentAction(description);
        if (!answer.ok) {
          setError(answer.error);
          return;
        }
        onApply(answer);
        setResult({ count: answer.rules.conditions.length, note: answer.note });
      } catch {
        setError(OFFLINE_MESSAGE);
      }
    });
  }

  return (
    <DescribeWithAiBox
      id="segment-ai"
      title="Describe with AI"
      hint="Say who should be in this segment. AI fills in the conditions below; check them before you save."
      placeholder="e.g. Pune contacts who opened an email in the last 30 days"
      buttonLabel="Fill in conditions"
      pending={pending}
      error={error}
      onSubmit={describe}
    >
      {result && (
        <div role="status" className="mt-3 flex flex-col gap-1 text-sm text-emerald-900">
          <p>
            Added {result.count} {result.count === 1 ? "condition" : "conditions"}. Check them below, then create the segment.
          </p>
          {result.note && <p className="text-xs text-amber-800">Note from AI: {result.note}</p>}
        </div>
      )}
    </DescribeWithAiBox>
  );
}
