"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, CircleAlert, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormField } from "@/lib/forms/schema";
import { cn } from "@/lib/utils";
import { BuilderSwitch } from "./builder-switch";

/** A custom contact field the form can ask for. */
export type AttributeChoice = { key: string; label: string; type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" };

/** Most fields one form can have (matches formConfigSchema). */
const MAX_FIELDS = 12;

const TYPE_HINT: Record<AttributeChoice["type"], string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  BOOLEAN: "Yes / No",
};

/** Human name of a field's target: "Email", "First name", "City (custom field)". */
export function targetName(target: string, attributes: AttributeChoice[]): string {
  if (target === "EMAIL") return "Email";
  if (target === "FIRSTNAME") return "First name";
  if (target === "LASTNAME") return "Last name";
  const attr = attributes.find((a) => `attr:${a.key}` === target);
  return attr ? attr.label : target.slice(5);
}

/** A short random id for a new field (only has to be unique within the form). */
function newFieldId(): string {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The form's fields: edit label / placeholder, required or not, move up or
 * down, remove, and add more from the contact fields that aren't used yet.
 * Email is always there and always required.
 */
export function FieldsEditor({
  fields,
  attributes,
  onChange,
}: {
  fields: FormField[];
  attributes: AttributeChoice[];
  onChange: (fields: FormField[]) => void;
}) {
  const used = new Set(fields.map((f) => f.target));
  const builtins = [
    { target: "FIRSTNAME", label: "First name", placeholder: "Priya" },
    { target: "LASTNAME", label: "Last name", placeholder: "Sharma" },
  ].filter((b) => !used.has(b.target));
  const customs = attributes.filter((a) => !used.has(`attr:${a.key}`));
  const full = fields.length >= MAX_FIELDS;

  function update(index: number, patch: Partial<FormField>) {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }
  function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= fields.length) return;
    const next = [...fields];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  }
  function remove(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }
  function add(field: Omit<FormField, "id">) {
    onChange([...fields, { id: newFieldId(), ...field }]);
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {fields.map((field, index) => {
          const isEmail = field.target === "EMAIL";
          const attr = field.target.startsWith("attr:") ? attributes.find((a) => `attr:${a.key}` === field.target) : undefined;
          const deleted = field.target.startsWith("attr:") && !attr;
          const name = targetName(field.target, attributes);
          const idBase = `field-${field.id}`;
          return (
            <li key={field.id} className={cn("rounded-lg border bg-white p-3", deleted && "border-amber-300 bg-amber-50/50")}>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">
                  {name}
                  <span className="ml-1.5 text-xs font-normal text-zinc-500">
                    {isEmail ? "· always required" : attr ? `· custom field, ${TYPE_HINT[attr.type].toLowerCase()}` : ""}
                  </span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${name} up`}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => move(index, 1)}
                  disabled={index === fields.length - 1}
                  aria-label={`Move ${name} down`}
                >
                  <ArrowDown aria-hidden />
                </Button>
                {!isEmail && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(index)}
                    aria-label={`Remove ${name}`}
                    className="text-zinc-500 hover:text-red-600"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </div>

              {deleted && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800">
                  <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                  This custom field was deleted from your contacts. Remove it so the form can be saved.
                </p>
              )}

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${idBase}-label`} className="text-xs text-zinc-600">
                    Label
                  </Label>
                  <Input
                    id={`${idBase}-label`}
                    value={field.label}
                    maxLength={80}
                    onChange={(e) => update(index, { label: e.target.value })}
                    aria-invalid={field.label.trim() === "" ? true : undefined}
                  />
                </div>
                {attr?.type !== "DATE" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${idBase}-placeholder`} className="text-xs text-zinc-600">
                      {attr?.type === "BOOLEAN" ? "Prompt (first option)" : "Placeholder"}
                    </Label>
                    <Input
                      id={`${idBase}-placeholder`}
                      value={field.placeholder}
                      maxLength={120}
                      placeholder={attr?.type === "BOOLEAN" ? "Choose…" : "Example text shown inside the box"}
                      onChange={(e) => update(index, { placeholder: e.target.value })}
                    />
                  </div>
                )}
              </div>
              {field.label.trim() === "" && <p className="mt-1.5 text-xs text-red-600">Every field needs a label.</p>}

              <div className="mt-3">
                <BuilderSwitch
                  label="Required"
                  description={isEmail ? "We need an email address to add someone to your list." : undefined}
                  checked={isEmail ? true : field.required}
                  disabled={isEmail}
                  onCheckedChange={(required) => update(index, { required })}
                />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="outline" disabled={full || (builtins.length === 0 && customs.length === 0)} />}
          >
            <Plus aria-hidden />
            Add a field
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            {builtins.length > 0 && (
              <DropdownMenuGroup>
                <DropdownMenuLabel>Contact details</DropdownMenuLabel>
                {builtins.map((b) => (
                  <DropdownMenuItem
                    key={b.target}
                    onClick={() => add({ target: b.target, label: b.label, placeholder: b.placeholder, required: false })}
                  >
                    {b.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}
            {builtins.length > 0 && customs.length > 0 && <DropdownMenuSeparator />}
            {customs.length > 0 && (
              <DropdownMenuGroup>
                <DropdownMenuLabel>Your custom fields</DropdownMenuLabel>
                {customs.map((a) => (
                  <DropdownMenuItem
                    key={a.key}
                    onClick={() => add({ target: `attr:${a.key}`, label: a.label.slice(0, 80), placeholder: "", required: false })}
                  >
                    <span className="min-w-0 flex-1 truncate">{a.label}</span>
                    <span className="text-xs text-zinc-400">{TYPE_HINT[a.type]}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-xs text-zinc-500">
          {full ? (
            `That's the most fields a form can have (${MAX_FIELDS}).`
          ) : (
            <>
              Need something else, like City or Birthday?{" "}
              <Link href="/contacts/attributes" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
                Create a custom field
              </Link>
              .
            </>
          )}
        </p>
      </div>
      <p className="text-xs text-zinc-500">Tip: short forms get more sign-ups. Email alone is often enough.</p>
    </div>
  );
}
