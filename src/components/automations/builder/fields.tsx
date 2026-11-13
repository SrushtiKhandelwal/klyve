"use client";

// Small form controls for the builder's settings panel.
import { useId, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: string; hint?: string; disabled?: boolean };

/** A labelled dropdown. `empty` is shown instead when there's nothing to pick. */
export function Picker({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose…",
  disabled,
  hint,
  empty,
}: {
  label: string;
  value: string | null;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: ReactNode;
  empty?: ReactNode;
}) {
  const id = useId();
  // A value that isn't among the options (e.g. a deleted list) shows as empty.
  const known = options.some((o) => o.value === value) ? value : null;
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-xs font-medium text-zinc-700">
        {label}
      </span>
      {options.length === 0 && empty ? (
        <div className="rounded-lg border border-dashed bg-zinc-50 px-3 py-2 text-xs text-zinc-600">{empty}</div>
      ) : (
        <Select
          items={options.map((o) => ({ value: o.value, label: o.label }))}
          value={known}
          onValueChange={(v) => typeof v === "string" && onChange(v)}
          disabled={disabled}
        >
          <SelectTrigger aria-labelledby={id} className="h-9 w-full bg-white">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="text-xs text-zinc-500">{o.hint}</span>}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

/**
 * A whole-number box. Keeps whatever is typed while it's not valid (with a
 * message) and only reports valid numbers, so the step is never broken.
 */
export function WholeNumberField({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  suffix,
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  suffix?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  // The step changed from outside (e.g. another step selected): show its value.
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }
  const n = Number(text);
  const valid = text.trim() !== "" && Number.isInteger(n) && n >= min && n <= max;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-medium text-zinc-700">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={text}
          disabled={disabled}
          aria-invalid={valid ? undefined : true}
          onChange={(e) => {
            setText(e.target.value);
            const next = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isInteger(next) && next >= min && next <= max) {
              setSeen(next);
              onChange(next);
            }
          }}
          className="h-9 w-24 bg-white"
        />
        {suffix}
      </div>
      {!valid && (
        <p role="alert" className="text-xs text-red-600">
          Enter a whole number from {min} to {max}.
        </p>
      )}
    </div>
  );
}

/** A plain labelled text box. */
export function TextField({
  label,
  value,
  onChange,
  maxLength,
  disabled,
  hint,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
  hint?: ReactNode;
  placeholder?: string;
  type?: "text" | "number" | "date";
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-zinc-700">
        {label}
      </label>
      <Input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 bg-white"
      />
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

/** A grey explanation box. */
export function Explainer({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-600 ring-1 ring-zinc-200">{children}</div>;
}
