"use client";

import { useActionState } from "react";
import { Loader2, PencilRuler, Sparkles } from "lucide-react";
import { createAutomationFromForm } from "@/app/actions/automations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The "Create" form on /automations/new. A real POST (Server Action) that
 * creates the draft and opens the builder; errors show under the button.
 * `compact` = just a "Start from scratch" button.
 */
export function CreateAutomationForm({
  recipeId,
  defaultName,
  compact,
  disabled,
}: {
  recipeId?: string;
  defaultName: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createAutomationFromForm, null);

  if (compact) {
    return (
      <form action={formAction} className="flex flex-col items-start gap-1 sm:items-end">
        <Button type="submit" variant="outline" disabled={pending || disabled}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PencilRuler aria-hidden />}
          Start from scratch
        </Button>
        {state?.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-xl border bg-white p-4 sm:p-5">
      {recipeId && <input type="hidden" name="recipeId" value={recipeId} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="automation-name">Name</Label>
        <Input id="automation-name" name="name" defaultValue={defaultName} maxLength={100} required disabled={pending || disabled} />
        <p className="text-xs text-zinc-500">Only you and your team see this.</p>
      </div>
      <Button type="submit" size="lg" disabled={pending || disabled}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
        Create automation
      </Button>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
