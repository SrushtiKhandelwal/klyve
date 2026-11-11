"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ATTRIBUTE_TYPE_LABELS, BUILTIN_FIELDS } from "@/lib/contacts/common";
import { cn } from "@/lib/utils";
import { columnName, sampleValues, SKIP_TARGET, type ImportAttribute, type ParsedCsv } from "./csv";
import { EMAIL_TARGET } from "@/lib/contacts/import-limits";

/** Step 2: say which contact field each CSV column goes into. */
export function MappingStep({
  csv,
  attributes,
  targets,
  onChange,
  onBack,
  onNext,
}: {
  csv: ParsedCsv;
  attributes: ImportAttribute[];
  /** One target per CSV column: a field key or SKIP_TARGET. */
  targets: string[];
  onChange: (targets: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  // Labels for the select's closed state ("Email", "Age (Number)", ...).
  const items = [
    { value: SKIP_TARGET, label: "Don't import" },
    ...BUILTIN_FIELDS.map((f) => ({ value: f.key, label: f.label })),
    ...attributes.map((a) => ({
      value: a.key,
      label: `${a.label} (${ATTRIBUTE_TYPE_LABELS[a.type]})`,
    })),
  ];

  const hasEmail = targets.includes(EMAIL_TARGET);
  const importedCount = targets.filter((t) => t !== SKIP_TARGET).length;

  function setTarget(column: number, target: string) {
    // A field can only come from one column: picking it here frees it elsewhere.
    onChange(
      targets.map((t, i) => {
        if (i === column) return target;
        return target !== SKIP_TARGET && t === target ? SKIP_TARGET : t;
      }),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-medium text-zinc-900">{csv.fileName}</span> ·{" "}
          {csv.rows.length.toLocaleString("en-US")} rows · {importedCount} of {csv.headers.length} columns
          will be imported
        </p>
        <Link
          href="/contacts/attributes"
          className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
        >
          <Plus className="size-4" aria-hidden />
          Need another field? Create a new field first
        </Link>
      </div>

      <ul className="divide-y rounded-xl border bg-white">
        {csv.headers.map((_, column) => {
          const samples = sampleValues(csv.rows, column);
          const target = targets[column] ?? SKIP_TARGET;
          const selectId = `map-column-${column}`;
          return (
            <li
              key={column}
              className={cn(
                "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
                target === SKIP_TARGET && "bg-zinc-50/60",
              )}
            >
              <div className="min-w-0">
                <label htmlFor={selectId} className="block truncate font-medium text-zinc-900">
                  {columnName(csv.headers, column)}
                </label>
                <p className="mt-0.5 truncate text-sm text-zinc-500">
                  {samples.length > 0 ? samples.join(" · ") : <em>No values in this column</em>}
                </p>
              </div>

              <Select
                items={items}
                value={target}
                onValueChange={(value) => setTarget(column, String(value ?? SKIP_TARGET))}
              >
                <SelectTrigger id={selectId} className="w-full shrink-0 bg-white sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Contact fields</SelectLabel>
                    {BUILTIN_FIELDS.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  {attributes.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Custom fields</SelectLabel>
                      {attributes.map((a) => (
                        <SelectItem key={a.key} value={a.key}>
                          {a.label}
                          <span className="text-muted-foreground">{ATTRIBUTE_TYPE_LABELS[a.type]}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectItem value={SKIP_TARGET}>Don&apos;t import</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </li>
          );
        })}
      </ul>

      {!hasEmail && (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Choose which column holds the email address. Every contact needs one.
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" size="lg" onClick={onBack}>
          <ArrowLeft aria-hidden />
          Choose another file
        </Button>
        <Button
          type="button"
          size="lg"
          disabled={!hasEmail}
          onClick={onNext}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Continue
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}
