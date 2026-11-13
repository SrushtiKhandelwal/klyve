"use client";

import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

// A searchable list of every time zone ("Asia/Kolkata (GMT+5:30)").
// There are about 400, so typing to filter beats scrolling. Searching ignores
// "_" and "/", so "new york" finds "America/New_York".

export type TimeZoneOption = { value: string; label: string };

/** "America/New_York (GMT-5)" → "america new york gmt-5" for matching. */
function searchable(text: string): string {
  return text.toLowerCase().replace(/[_/()]+/g, " ").replace(/\s+/g, " ").trim();
}

export function TimeZoneSelect({
  id,
  options,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id?: string;
  options: TimeZoneOption[];
  value: string;
  onChange: (timezone: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  // Base UI keeps the selected value as the plain zone name, and shows/filters by the label.
  const items = useMemo(
    () => Combobox.createItems(options, { getValue: (o) => o.value, getLabel: (o) => o.label }),
    [options],
  );

  return (
    <Combobox.Root
      items={items}
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string" && next) onChange(next);
      }}
      filter={(item: TimeZoneOption, query: string) => searchable(item.label).includes(searchable(query))}
      disabled={disabled}
      autoHighlight
    >
      <Combobox.Trigger
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-white px-2.5 text-left text-sm outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        )}
      >
        <Combobox.Value placeholder="Choose a time zone">
          {(selected: string | null) => options.find((o) => o.value === selected)?.label ?? selected ?? "Choose a time zone"}
        </Combobox.Value>
        <ChevronsUpDownIcon className="size-4 shrink-0 text-zinc-400" aria-hidden />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup
            aria-label="Choose a time zone"
            className="w-(--anchor-width) max-w-(--available-width) min-w-72 origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden"
          >
            <div className="flex items-center gap-2 border-b px-2.5">
              <SearchIcon className="size-4 shrink-0 text-zinc-400" aria-hidden />
              <Combobox.Input
                placeholder="Search, e.g. Kolkata or New York"
                className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
              />
            </div>
            <Combobox.Empty>
              <p className="px-3 py-4 text-sm text-zinc-500">No time zone matches that.</p>
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(18rem,var(--available-height))] overflow-y-auto overscroll-contain p-1 scroll-py-1 data-empty:p-0">
              {(option: TimeZoneOption) => (
                <Combobox.Item
                  key={option.value}
                  value={option.value}
                  className="grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-md px-2 py-1.5 outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <Combobox.ItemIndicator className="col-start-1">
                    <CheckIcon className="size-4 text-emerald-600" aria-hidden />
                  </Combobox.ItemIndicator>
                  <span className="col-start-2 truncate">{option.label}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
