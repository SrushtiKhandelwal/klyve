"use client";

// Small, typed form controls used by the properties panel and settings.
// Each one shows the value, lets the user change it, and only reports values
// that are valid for the document schema (so the document never breaks).
import { useId, useRef, useState, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, Braces, ImagePlus, Link2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { colorSchema, imageSrcSchema, linkSchema, type Align, type MergeTag, type Padding } from "@/lib/templates/document";

// ── Layout helpers ───────────────────────────────────────────────────────────

export function Field({
  label,
  htmlFor,
  hint,
  error,
  errorId,
  children,
  action,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  errorId?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-zinc-700">
          {label}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** A titled group of fields inside a panel. */
export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b px-4 py-4 last:border-b-0">
      <h3 className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}

// ── Segmented buttons (alignment, heading level, device...) ──────────────────

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  size = "default",
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  size?: "sm" | "default";
}) {
  // A radio group: arrow keys move between options, like native radios.
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex w-full rounded-lg border bg-zinc-50 p-0.5"
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = (index + step + options.length) % options.length;
        onChange(options[next].value);
        refs.current[next]?.focus();
      }}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.icon ? o.label : undefined}
            title={o.icon ? o.label : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-zinc-600 outline-none transition-colors hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-emerald-500",
              size === "sm" ? "h-6" : "h-7",
              active && "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200",
            )}
          >
            {o.icon}
            {!o.icon && o.label}
          </button>
        );
      })}
    </div>
  );
}

export function AlignField({ value, onChange, label = "Alignment" }: { value: Align; onChange: (v: Align) => void; label?: string }) {
  return (
    <Field label={label}>
      <Segmented
        label={label}
        value={value}
        onChange={onChange}
        options={[
          { value: "left", label: "Align left", icon: <AlignLeft className="size-4" /> },
          { value: "center", label: "Align centre", icon: <AlignCenter className="size-4" /> },
          { value: "right", label: "Align right", icon: <AlignRight className="size-4" /> },
        ]}
      />
    </Field>
  );
}

// ── Numbers ──────────────────────────────────────────────────────────────────

/**
 * Slider + number box. The number box may hold a half-typed value; we only
 * report it once it's a valid number inside [min, max].
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "px",
  onChange,
  slider = true,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  slider?: boolean;
  hint?: ReactNode;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const parsed = Number(shown);
  const invalid = draft !== null && (shown.trim() === "" || !Number.isFinite(parsed) || parsed < min || parsed > max);
  const round = (n: number) => (step < 1 ? Math.round(n * 10) / 10 : Math.round(n));

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={invalid ? `Use a number from ${min} to ${max}.` : null}
      errorId={`${id}-err`}
    >
      <div className="flex items-center gap-2">
        {slider && (
          <input
            type="range"
            aria-label={label}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => {
              setDraft(null);
              onChange(round(Number(e.target.value)));
            }}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-emerald-600"
          />
        )}
        <div className={cn("relative", slider ? "w-20 shrink-0" : "w-full")}>
          <Input
            id={id}
            inputMode="decimal"
            value={shown}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-err` : undefined}
            onChange={(e) => {
              const text = e.target.value;
              setDraft(text);
              const n = Number(text);
              if (text.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(round(n));
            }}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              // Arrow up/down nudges the value, like a native number box.
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              const delta = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
              setDraft(null);
              onChange(round(Math.min(max, Math.max(min, value + delta))));
            }}
            className="h-7 pr-7 text-xs tabular-nums"
          />
          {unit && (
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-zinc-400">
              {unit}
            </span>
          )}
        </div>
      </div>
    </Field>
  );
}

/** Four padding values with a "same on all sides" shortcut. */
export function PaddingField({ value, onChange, label = "Padding" }: { value: Padding; onChange: (p: Padding) => void; label?: string }) {
  const same = value.top === value.right && value.right === value.bottom && value.bottom === value.left;
  const [linked, setLinked] = useState(same);
  const sides = ["top", "right", "bottom", "left"] as const;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-700">{label}</span>
        <label className="flex items-center gap-1.5 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={linked}
            onChange={(e) => {
              setLinked(e.target.checked);
              if (e.target.checked) onChange({ top: value.top, right: value.top, bottom: value.top, left: value.top });
            }}
            className="accent-emerald-600"
          />
          Same on all sides
        </label>
      </div>
      {linked ? (
        <NumberField
          label="All sides"
          value={value.top}
          min={0}
          max={120}
          onChange={(n) => onChange({ top: n, right: n, bottom: n, left: n })}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {sides.map((side) => (
            <NumberField
              key={side}
              slider={false}
              label={side[0].toUpperCase() + side.slice(1)}
              value={value[side]}
              min={0}
              max={120}
              onChange={(n) => onChange({ ...value, [side]: n })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Colours ──────────────────────────────────────────────────────────────────

const toSixDigits = (hex: string) =>
  hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;

/**
 * Colour picker + hex box. With `nullable`, the colour can be reset to
 * "inherit" (null), shown with `inheritedColor` and the `inheritLabel`.
 */
export function ColorField({
  label,
  value,
  onChange,
  nullable,
  inheritedColor = "#000000",
  inheritLabel = "Default",
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  nullable?: boolean;
  inheritedColor?: string;
  inheritLabel?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const effective = value ?? inheritedColor;
  const shown = draft ?? (value === null ? "" : value);
  const invalid = draft !== null && draft !== "" && !colorSchema.safeParse(draft).success;

  return (
    <Field
      label={label}
      htmlFor={id}
      error={invalid ? "Use a colour like #059669." : null}
      errorId={`${id}-err`}
      action={
        nullable && value !== null ? (
          <button type="button" className="text-xs text-emerald-700 hover:underline" onClick={() => onChange(null)}>
            Reset to {inheritLabel.toLowerCase()}
          </button>
        ) : null
      }
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={toSixDigits(effective)}
          onChange={(e) => {
            setDraft(null);
            onChange(e.target.value);
          }}
          className="size-7 shrink-0 cursor-pointer rounded-md border bg-white p-0.5"
        />
        <Input
          id={id}
          value={shown}
          placeholder={value === null ? `${inheritLabel} (${inheritedColor})` : "#000000"}
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-err` : undefined}
          onChange={(e) => {
            let text = e.target.value.trim();
            if (text && !text.startsWith("#")) text = `#${text}`;
            setDraft(e.target.value);
            if (colorSchema.safeParse(text).success) onChange(text.toLowerCase());
            else if (text === "" && nullable) onChange(null);
          }}
          onBlur={() => setDraft(null)}
          className="h-7 font-mono text-xs"
        />
      </div>
    </Field>
  );
}

// ── Merge tags ───────────────────────────────────────────────────────────────

/** The small "{ }" button that lists personalization tags. */
export function MergeTagMenu({
  mergeTags,
  onInsert,
  label = "Insert personalization",
  finalFocus,
  filter,
  children,
}: {
  mergeTags: MergeTag[];
  onInsert: (tag: string) => void;
  label?: string;
  finalFocus?: React.RefObject<HTMLElement | null>;
  filter?: (tag: MergeTag) => boolean;
  children?: ReactNode;
}) {
  const tags = filter ? mergeTags.filter(filter) : mergeTags;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          children ? undefined : (
            <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} />
          )
        }
        className={children ? "inline-flex" : undefined}
      >
        {children ?? <Braces className="size-3.5" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" finalFocus={finalFocus}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {tags.length === 0 && <p className="px-2 py-1.5 text-xs text-zinc-500">No tags available here.</p>}
        {tags.map((t) => (
          <DropdownMenuItem key={t.tag} onClick={() => onInsert(t.tag)} className="flex-col items-start gap-0">
            <span className="text-sm">{t.label}</span>
            <code className="max-w-full truncate text-[11px] text-zinc-500">{t.tag}</code>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Inserts `text` into an input's value at the cursor and puts the cursor after it. */
function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement | null, value: string, text: string): string {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const next = value.slice(0, start) + text + value.slice(end);
  const caret = start + text.length;
  // After the menu closes and React re-renders, put the cursor back.
  setTimeout(() => {
    el?.focus();
    el?.setSelectionRange(caret, caret);
  }, 0);
  return next;
}

/** A text box (or textarea) with a "{ }" personalization button. */
export function MergeTagTextField({
  label,
  value,
  onChange,
  mergeTags,
  placeholder,
  maxLength,
  multiline,
  hint,
  error,
  id: givenId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mergeTags: MergeTag[];
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  hint?: ReactNode;
  error?: string | null;
  id?: string;
}) {
  const autoId = useId();
  const id = givenId ?? autoId;
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const common = {
    id,
    ref,
    value,
    placeholder,
    maxLength,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-err` : undefined,
  };
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      errorId={`${id}-err`}
      action={<MergeTagMenu mergeTags={mergeTags} finalFocus={ref} onInsert={(tag) => onChange(insertAtCursor(ref.current, value, tag))} />}
    >
      {multiline ? (
        <textarea
          {...common}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
      ) : (
        <Input {...common} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
      )}
    </Field>
  );
}

// ── Links ────────────────────────────────────────────────────────────────────

/** Why a link isn't valid yet, or null when it's fine. */
export function linkError(value: string): string | null {
  const r = linkSchema.safeParse(value);
  return r.success ? null : (r.error.issues[0]?.message ?? "This link isn't valid.");
}

/** "example.com" → "https://example.com" (a suggestion; never applied silently). */
function suggestLink(value: string): string | null {
  const v = value.trim();
  if (!v || /^[a-z]+:/i.test(v) || v.startsWith("{{")) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  if (/^\+?[\d\s()-]{6,}$/.test(v)) return `tel:${v.replace(/[\s()-]/g, "")}`;
  if (/^[^\s]+\.[^\s]+$/.test(v)) return `https://${v.replace(/^\/+/, "")}`;
  return null;
}

/**
 * Link box with validation. Invalid text stays in the box (with an error)
 * but is NOT written to the document until it's fixed.
 */
export function LinkField({
  label = "Link",
  value,
  onChange,
  mergeTags,
  placeholder = "https://example.com",
  hint,
  allowEmpty = true,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  mergeTags: MergeTag[];
  placeholder?: string;
  hint?: ReactNode;
  allowEmpty?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const error = draft !== null ? (draft.trim() === "" && !allowEmpty ? "Add a link." : linkError(draft)) : null;
  const suggestion = error ? suggestLink(shown) : null;

  const commit = (text: string) => {
    if (linkError(text) === null && (allowEmpty || text.trim() !== "")) {
      onChange(text.trim());
      setDraft(null);
    } else {
      setDraft(text);
    }
  };

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      action={
        <MergeTagMenu
          mergeTags={mergeTags}
          label="Insert a personalized link"
          finalFocus={ref}
          onInsert={(tag) => {
            // A whole-tag link (e.g. {{ unsubscribe_url }}) replaces an empty
            // or placeholder value; otherwise insert where the cursor is.
            const replace = shown.trim() === "" || shown.trim() === "https://";
            commit(replace ? tag : insertAtCursor(ref.current, shown, tag));
          }}
        />
      }
    >
      <div className="relative">
        <Link2 className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-zinc-400" aria-hidden />
        <Input
          id={id}
          ref={ref}
          value={shown}
          placeholder={placeholder}
          spellCheck={false}
          inputMode="url"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => commit(e.target.value)}
          className="h-8 pl-7 text-sm"
        />
      </div>
      {error && (
        <div id={`${id}-err`} role="alert" className="flex flex-wrap items-center gap-x-2 text-xs text-red-600">
          <span>{error} Not saved until fixed.</span>
          {suggestion && (
            <button type="button" className="font-medium text-emerald-700 underline" onClick={() => commit(suggestion)}>
              Use {suggestion}
            </button>
          )}
        </div>
      )}
    </Field>
  );
}

// ── Images ───────────────────────────────────────────────────────────────────

/** Choose from the media library, or paste an image address. */
export function ImageField({
  label = "Image",
  src,
  onChange,
  onPick,
  allowRemove = true,
}: {
  label?: string;
  src: string;
  /** mediaId is null when the address was typed/pasted. */
  onChange: (src: string, mediaId: string | null) => void;
  onPick: () => void;
  allowRemove?: boolean;
}) {
  const id = useId();
  // The typed address is only used when the box loses focus (or on Enter),
  // so half-typed addresses don't show as broken images.
  const [draft, setDraft] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const shown = draft ?? src;
  const result = imageSrcSchema.safeParse(shown);
  const error = draft !== null && tried && !result.success ? result.error.issues[0]?.message : null;
  const commit = () => {
    if (draft === null) return;
    setTried(true);
    if (imageSrcSchema.safeParse(draft).success) {
      if (draft.trim() !== src) onChange(draft.trim(), null);
      setDraft(null);
      setTried(false);
    }
  };

  return (
    <Field label={label} htmlFor={id} error={error ? `${error} Not saved until fixed.` : null} errorId={`${id}-err`}>
      <div className="flex flex-col gap-2">
        {src ? (
          <div className="flex items-center gap-2 rounded-lg border bg-zinc-50 p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- user image, any host */}
            <img src={src} alt="" className="size-12 shrink-0 rounded object-cover" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Button type="button" size="sm" variant="outline" onClick={onPick}>
                <ImagePlus /> Replace
              </Button>
            </div>
            {allowRemove && (
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove image" onClick={() => onChange("", null)}>
                <Trash2 />
              </Button>
            )}
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={onPick} className="h-16 border-dashed">
            <ImagePlus /> Choose or upload an image
          </Button>
        )}
        <Input
          id={id}
          value={shown}
          placeholder="…or paste an image address (https://…)"
          spellCheck={false}
          inputMode="url"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className="h-8 text-xs"
        />
      </div>
    </Field>
  );
}

