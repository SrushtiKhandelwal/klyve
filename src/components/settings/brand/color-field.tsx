"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** The colour picker only understands "#rrggbb", so "#0a5" becomes "#00aa55". */
function toSixDigits(value: string): string {
  if (!HEX.test(value)) return "#000000";
  if (value.length === 7) return value.toLowerCase();
  const [, r, g, b] = value.toLowerCase();
  return `#${r}${r}${g}${g}${b}${b}`;
}

/** A colour swatch (opens the system colour picker) plus a hex text box. */
export function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const valid = HEX.test(value);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={toSixDigits(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="size-8 shrink-0 cursor-pointer rounded-lg border border-input bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            const next = e.target.value.trim();
            onChange(next && !next.startsWith("#") ? `#${next}` : next);
          }}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          className="font-mono uppercase"
          aria-invalid={!valid || error ? true : undefined}
          aria-describedby={`${id}-hint`}
        />
      </div>
      <p id={`${id}-hint`} className={`text-xs ${!valid || error ? "text-red-600" : "text-zinc-500"}`}>
        {error ?? (!valid ? "Use a colour like #059669." : hint)}
      </p>
    </div>
  );
}
