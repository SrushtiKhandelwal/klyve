"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@base-ui/react/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAX_RANGE_DAYS, daysBetween, rangeSearch, type RangePreset, type StatsRange } from "@/lib/statistics/range";
import { cn } from "@/lib/utils";

// The date range picker of the statistics pages: Last 7 / 30 / 90 days or a
// custom from–to, plus (marketing only) "Include automation emails". It only
// changes the URL (?range=…); the server page reads it and does the counting.

const PRESET_ITEMS: { value: RangePreset; label: string }[] = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

export function DateRangeControl({
  basePath,
  range,
  today,
  includeAutomation,
}: {
  /** "/statistics" or "/transactional/statistics". */
  basePath: string;
  range: StatsRange;
  /** Today in the workspace time zone ("YYYY-MM-DD"): the latest day you can pick. */
  today: string;
  /** Pass a boolean to show the "Include automation emails" switch. */
  includeAutomation?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preset, setPreset] = useState<RangePreset>(range.preset);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const ids = { from: useId(), to: useId(), toggle: useId() };

  function go(next: Pick<StatsRange, "from" | "to" | "preset">, automation = includeAutomation) {
    startTransition(() => {
      router.replace(`${basePath}?${rangeSearch(next, automation)}`, { scroll: false });
    });
  }

  function choosePreset(value: RangePreset) {
    setPreset(value);
    // Custom: show the two date boxes and wait for "Apply".
    if (value !== "custom") go({ preset: value, from: "", to: "" });
  }

  function applyCustom(event: React.FormEvent) {
    event.preventDefault();
    if (!from || !to) return void toast.error("Choose both dates.");
    if (from > to) return void toast.error("The start date must be before the end date.");
    if (daysBetween(from, to) > MAX_RANGE_DAYS) return void toast.error(`Choose at most ${MAX_RANGE_DAYS} days.`);
    go({ preset: "custom", from, to });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <Select items={PRESET_ITEMS} value={preset} onValueChange={(v) => v && choosePreset(v as RangePreset)}>
        <SelectTrigger aria-label="Date range" className="w-full bg-white sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESET_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === "custom" && (
        <form onSubmit={applyCustom} className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor={ids.from} className="text-xs text-zinc-500">
              From
            </Label>
            <Input
              id={ids.from}
              type="date"
              value={from}
              max={to || today}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40 bg-white"
              required
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={ids.to} className="text-xs text-zinc-500">
              To
            </Label>
            <Input
              id={ids.to}
              type="date"
              value={to}
              min={from || undefined}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="w-40 bg-white"
              required
            />
          </div>
          <Button type="submit" variant="outline" className="bg-white" disabled={pending}>
            Apply
          </Button>
        </form>
      )}

      {includeAutomation !== undefined && (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 sm:ml-auto sm:h-8">
          <Switch.Root
            checked={includeAutomation}
            onCheckedChange={(checked) => go(range, checked)}
            disabled={pending}
            aria-labelledby={`${ids.toggle}-label`}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors outline-none",
              "bg-zinc-300 focus-visible:ring-3 focus-visible:ring-emerald-500/40 data-checked:bg-emerald-600 data-disabled:opacity-60",
            )}
          >
            <Switch.Thumb className="size-4 rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-4" />
          </Switch.Root>
          <span id={`${ids.toggle}-label`}>Include automation emails</span>
        </label>
      )}

      {pending && <Loader2 className="size-4 animate-spin self-center text-zinc-400" aria-label="Loading" />}
    </div>
  );
}
