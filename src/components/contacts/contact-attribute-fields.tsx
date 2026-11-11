"use client";

import { useState } from "react";
import type { AttributeValue } from "@/lib/contacts/common";
import type { AttributeDefinition } from "@/lib/contacts/lookups";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// The inputs for a workspace's custom fields (City, Age, VIP...), used by both
// the "Add contact" dialog and the contact page. Each input is named
// "attr:<KEY>" — the Server Action reads exactly those names.

export const attrFieldName = (key: string) => `attr:${key}`;

export function ContactAttributeFields({
  attributes,
  values = {},
  errors,
  idPrefix,
  disabled,
}: {
  attributes: AttributeDefinition[];
  /** Current stored values, keyed by attribute key. */
  values?: Record<string, AttributeValue>;
  errors?: Record<string, string[]>;
  /** Keeps input ids unique if two forms are on one page. */
  idPrefix: string;
  disabled?: boolean;
}) {
  if (attributes.length === 0) return null;

  return (
    <>
      {attributes.map((attr) => {
        const name = attrFieldName(attr.key);
        const id = `${idPrefix}-${attr.key}`;
        const error = errors?.[name]?.[0];
        const value = values[attr.key];
        return (
          <div key={attr.id} className="flex flex-col gap-2">
            <Label htmlFor={id}>{attr.label}</Label>
            {attr.type === "BOOLEAN" ? (
              <BooleanSelect
                id={id}
                name={name}
                defaultValue={typeof value === "boolean" ? value : null}
                invalid={Boolean(error)}
                disabled={disabled}
              />
            ) : (
              <Input
                id={id}
                name={name}
                type={attr.type === "NUMBER" ? "number" : attr.type === "DATE" ? "date" : "text"}
                step={attr.type === "NUMBER" ? "any" : undefined}
                defaultValue={value === null || value === undefined ? "" : String(value)}
                maxLength={attr.type === "TEXT" ? 1000 : undefined}
                disabled={disabled}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
              />
            )}
            {error && (
              <p id={`${id}-error`} className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}

// "none" stands for "no value". The hidden input below sends "" for it,
// which the server stores as "no value".
const BOOLEAN_ITEMS = [
  { value: "none", label: "—" },
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

function BooleanSelect({
  id,
  name,
  defaultValue,
  invalid,
  disabled,
}: {
  id: string;
  name: string;
  defaultValue: boolean | null;
  invalid: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(defaultValue === null ? "none" : String(defaultValue));
  return (
    <>
      <Select
        items={BOOLEAN_ITEMS}
        value={value}
        onValueChange={(v) => setValue(v ?? "none")}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BOOLEAN_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* We send the value ourselves so it's always exactly "", "true" or "false". */}
      <input type="hidden" name={name} value={value === "none" ? "" : value} />
    </>
  );
}
