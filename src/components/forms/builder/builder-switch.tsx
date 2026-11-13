"use client";

import { useId } from "react";
import { Switch } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

/**
 * An on/off switch with a label (and optional explanation). The whole row is
 * a <label>, so clicking anywhere on it flips the switch.
 */
export function BuilderSwitch({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label className={cn("flex items-start gap-3", disabled ? "cursor-default" : "cursor-pointer")}>
      {/* Base UI's Switch: a real role="switch" control, keyboard-friendly (Space toggles). */}
      <Switch.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value)}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-text` : undefined}
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors outline-none",
          "bg-zinc-300 data-checked:bg-emerald-600 focus-visible:ring-3 focus-visible:ring-emerald-500/40",
          "data-disabled:cursor-default data-disabled:opacity-60",
        )}
      >
        <Switch.Thumb className="size-4 rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-4" />
      </Switch.Root>
      <span className="block min-w-0">
        <span id={`${id}-label`} className="block text-sm font-medium text-zinc-900">
          {label}
        </span>
        {description && (
          <span id={`${id}-text`} className="mt-0.5 block text-xs text-zinc-500">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
