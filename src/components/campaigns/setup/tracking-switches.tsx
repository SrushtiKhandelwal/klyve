"use client";

import { useId } from "react";
import { Switch } from "@base-ui/react/switch";
import { Eye, MousePointerClick, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Track opens" and "Track clicks" for a draft campaign. Both start on; turning
 * one off means the report shows "tracking was off" instead of misleading zeros.
 * Changes save automatically with the rest of the draft.
 */
export function TrackingSwitches({
  trackOpens,
  trackClicks,
  onChange,
}: {
  trackOpens: boolean;
  trackClicks: boolean;
  onChange: (patch: { trackOpens?: boolean; trackClicks?: boolean }) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-zinc-900">Tracking</legend>
      <TrackingRow
        icon={Eye}
        title="Track opens"
        checked={trackOpens}
        onCheckedChange={(v) => onChange({ trackOpens: v })}
        text="Adds a tiny invisible image to see roughly how many people opened the email. Opens are an estimate: some email apps load images automatically, others block them."
        note="Privacy: we record when it was opened and the kind of email app. The reader's IP address is never stored, only a scrambled fingerprint used to ignore duplicates."
      />
      <TrackingRow
        icon={MousePointerClick}
        title="Track clicks"
        checked={trackClicks}
        onCheckedChange={(v) => onChange({ trackClicks: v })}
        text="Links are rewritten to pass through Klyve first, so we can count clicks per link, then send people straight on to the real page."
      />
    </fieldset>
  );
}

function TrackingRow({
  icon: Icon,
  title,
  text,
  note,
  checked,
  onCheckedChange,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  note?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    // The whole row is a <label>, so clicking anywhere on it flips the switch.
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:border-zinc-300">
      <Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
      {/* Only <span>s inside a <label> (valid HTML). */}
      <span className="block min-w-0 flex-1">
        <span id={`${id}-title`} className="block text-sm font-medium text-zinc-900">
          {title}
        </span>
        <span id={`${id}-text`} className="mt-0.5 block text-xs text-zinc-500">
          {text}
          {note && <span className="mt-1 block text-zinc-500">{note}</span>}
        </span>
      </span>
      {/* Base UI's Switch: a real role="switch" control, keyboard-friendly (Space toggles). */}
      <Switch.Root
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value)}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-text`}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors outline-none",
          "bg-zinc-300 data-checked:bg-emerald-600 focus-visible:ring-3 focus-visible:ring-emerald-500/40",
        )}
      >
        <Switch.Thumb className="size-4 rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-4" />
      </Switch.Root>
    </label>
  );
}
