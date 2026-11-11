"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ListOption } from "@/lib/contacts/lookups";
import { cn } from "@/lib/utils";

export type ImportOptions = {
  listMode: "none" | "existing" | "new";
  listId: string;
  newListName: string;
  updateExisting: boolean;
  consent: boolean;
};

export const DEFAULT_OPTIONS: ImportOptions = {
  listMode: "none",
  listId: "",
  newListName: "",
  updateExisting: true,
  consent: false,
};

/** What's still missing before the import can start (null = ready). */
export function optionsProblem(options: ImportOptions, lists: ListOption[]): string | null {
  if (options.listMode === "existing" && !lists.some((l) => l.id === options.listId)) {
    return "Choose a list.";
  }
  if (options.listMode === "new" && options.newListName.trim() === "") {
    return "Give the new list a name.";
  }
  if (!options.consent) return "Please confirm that these contacts agreed to receive your emails.";
  return null;
}

/** Step 3: list, what to do with existing contacts, and the consent box. */
export function OptionsStep({
  rowCount,
  lists,
  options,
  onChange,
  error,
  starting,
  onBack,
  onStart,
}: {
  rowCount: number;
  lists: ListOption[];
  options: ImportOptions;
  onChange: (options: ImportOptions) => void;
  /** An error from the server (e.g. the list name is taken). */
  error: string | null;
  starting: boolean;
  onBack: () => void;
  onStart: () => void;
}) {
  const set = (patch: Partial<ImportOptions>) => onChange({ ...options, ...patch });
  const problem = optionsProblem(options, lists);
  const listItems = lists.map((l) => ({ value: l.id, label: l.name }));

  return (
    <div className="flex flex-col gap-5">
      <Section title="Add the contacts to a list" description="Optional. Handy for sending a campaign to just these people.">
        <Radio name="list-mode" checked={options.listMode === "none"} onSelect={() => set({ listMode: "none" })}>
          Don&apos;t add them to a list
        </Radio>
        <Radio
          name="list-mode"
          checked={options.listMode === "existing"}
          onSelect={() => set({ listMode: "existing" })}
          disabled={lists.length === 0}
        >
          An existing list{lists.length === 0 && <span className="text-zinc-400"> (you have no lists yet)</span>}
        </Radio>
        {options.listMode === "existing" && (
          <div className="pl-7">
            <Select
              items={listItems}
              value={options.listId || null}
              onValueChange={(value) => set({ listId: String(value ?? "") })}
            >
              <SelectTrigger aria-label="List" className="w-full bg-white sm:w-72">
                <SelectValue placeholder="Choose a list" />
              </SelectTrigger>
              <SelectContent>
                {lists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Radio name="list-mode" checked={options.listMode === "new"} onSelect={() => set({ listMode: "new" })}>
          Create a new list
        </Radio>
        {options.listMode === "new" && (
          <div className="pl-7">
            <Input
              aria-label="New list name"
              placeholder="e.g. Newsletter sign-ups"
              maxLength={100}
              value={options.newListName}
              onChange={(e) => set({ newListName: e.target.value })}
              className="w-full bg-white sm:w-72"
            />
          </div>
        )}
      </Section>

      <Section
        title="Contacts that already exist"
        description="Matched by email address. Unsubscribed, bounced and complained contacts always stay that way."
      >
        <Radio name="existing" checked={options.updateExisting} onSelect={() => set({ updateExisting: true })}>
          Update their details{" "}
          <span className="text-zinc-500">(only the columns you import; empty cells are ignored)</span>
        </Radio>
        <Radio name="existing" checked={!options.updateExisting} onSelect={() => set({ updateExisting: false })}>
          Skip them <span className="text-zinc-500">(leave them exactly as they are)</span>
        </Radio>
      </Section>

      <div
        className={cn(
          "rounded-xl border p-4",
          options.consent ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60",
        )}
      >
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={options.consent}
            onCheckedChange={(checked) => set({ consent: checked === true })}
          />
          <span>
            <span className="font-medium text-zinc-900">
              I confirm these contacts agreed to receive emails from me.
            </span>
            <span className="mt-1 flex items-center gap-1 text-zinc-600">
              <ShieldCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
              Sending to people who didn&apos;t sign up is spam, and gets accounts suspended.
            </span>
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={starting}>
          <ArrowLeft aria-hidden />
          Back to columns
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {problem && <p className="text-sm text-zinc-500 sm:text-right">{problem}</p>}
          <Button
            type="button"
            size="lg"
            disabled={problem !== null || starting}
            onClick={onStart}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {starting && <Loader2 className="animate-spin" aria-hidden />}
            Import {rowCount.toLocaleString("en-US")} {rowCount === 1 ? "row" : "rows"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border bg-white p-4">
      <legend className="sr-only">{title}</legend>
      <div>
        <p className="font-medium text-zinc-900" aria-hidden>
          {title}
        </p>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>
      {children}
    </fieldset>
  );
}

/** A plain native radio button (simple and accessible) with a label. */
function Radio({
  name,
  checked,
  onSelect,
  disabled,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 text-sm text-zinc-800",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 accent-emerald-600"
      />
      <span>{children}</span>
    </label>
  );
}
