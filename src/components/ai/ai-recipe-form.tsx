"use client";

import { useActionState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { createAutomationFromAiForm } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The "Create automation" form when the recipe was picked by "Describe with
// AI": the same as the normal form, plus the recipe's one setting (list,
// form or date field) preselected with the AI's choice. The server checks
// the choice again before creating the draft.

export type RecipeSettingField = {
  label: string;
  options: { value: string; label: string }[];
  /** The AI's choice (already checked against this workspace), else the first option. */
  defaultValue: string;
  /** Shown when the workspace has nothing to choose from. */
  emptyNote: string;
  /** Label of a "nothing yet" choice (left out = one of the options must be picked). */
  noneLabel?: string;
};

export function AiRecipeForm({
  recipeId,
  defaultName,
  setting,
  disabled,
}: {
  recipeId: string;
  defaultName: string;
  setting: RecipeSettingField | null;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createAutomationFromAiForm, null);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-xl border bg-white p-4 sm:p-5">
      <input type="hidden" name="recipeId" value={recipeId} />
      <p className="flex items-center gap-1.5 text-xs text-emerald-800">
        <Sparkles className="size-3.5 text-emerald-600" aria-hidden />
        Filled in by AI. Check it before you create the automation.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="automation-name">Name</Label>
        <Input id="automation-name" name="name" defaultValue={defaultName} maxLength={100} required disabled={pending || disabled} />
        <p className="text-xs text-zinc-500">Only you and your team see this.</p>
      </div>
      {setting && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="automation-setting">{setting.label}</Label>
          {setting.options.length > 0 ? (
            <select
              id="automation-setting"
              name="setting"
              defaultValue={setting.defaultValue}
              disabled={pending || disabled}
              className="h-9 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              {setting.noneLabel && <option value="">{setting.noneLabel}</option>}
              {setting.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-zinc-500">{setting.emptyNote}</p>
          )}
        </div>
      )}
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
