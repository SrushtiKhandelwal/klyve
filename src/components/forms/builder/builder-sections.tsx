"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CircleAlert, Info, MailCheck, ShieldCheck } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { ColorField } from "@/components/settings/brand/color-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormConfig } from "@/lib/forms/schema";
import { cn } from "@/lib/utils";
import { BuilderSwitch } from "./builder-switch";

// The settings cards on the left of the form builder. Each one gets the
// current values and reports changes upward; the builder saves them.

/** A titled card with an icon. */
export function BuilderSection({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 rounded-xl border bg-white">
      <div className="flex items-start gap-3 border-b px-4 py-3.5 sm:px-5">
        <Glyph icon={Icon} className="mt-0.5" />
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-semibold text-zinc-900">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
        </div>
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

/** A labelled text box (or text area) with a character limit and an optional hint/error. */
function TextField({
  id,
  label,
  value,
  onChange,
  max,
  multiline,
  placeholder,
  hint,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  multiline?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  error?: string | null;
}) {
  const describedBy = error || hint ? `${id}-hint` : undefined;
  const common = {
    id,
    value,
    maxLength: max,
    placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  } as const;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea {...common} rows={2} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input {...common} onChange={(e) => onChange(e.target.value)} />
      )}
      {(error || hint) && (
        <p id={describedBy} className={cn("text-xs", error ? "text-red-600" : "text-zinc-500")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

type ConfigChange = (patch: Partial<FormConfig>) => void;

// ── Texts ───────────────────────────────────────────────────────────────────

export function TextsEditor({ config, onChange }: { config: FormConfig; onChange: ConfigChange }) {
  return (
    <div className="flex flex-col gap-4">
      <TextField id="form-title" label="Title" value={config.title} max={120} onChange={(title) => onChange({ title })} placeholder="Join our newsletter" />
      <TextField
        id="form-description"
        label="Description"
        value={config.description}
        max={500}
        multiline
        onChange={(description) => onChange({ description })}
        placeholder="What will people get? How often?"
        hint="Say what people get and how often. It's the best way to get more sign-ups."
      />
      <TextField
        id="form-button"
        label="Button text"
        value={config.buttonLabel}
        max={40}
        onChange={(buttonLabel) => onChange({ buttonLabel })}
        placeholder="Subscribe"
        error={config.buttonLabel.trim() === "" ? "The button needs some text." : null}
      />
      <TextField
        id="form-consent"
        label="Consent checkbox text"
        value={config.consentText}
        max={400}
        multiline
        onChange={(consentText) => onChange({ consentText })}
        placeholder="I agree to receive emails from … I can unsubscribe at any time."
        hint={
          config.consentText.trim()
            ? "People must tick this box to sign up."
            : "Empty = no checkbox. Clicking the button then counts as agreeing."
        }
      />
      <div className="flex gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900">
        <ShieldCheck className="mt-px size-4 shrink-0 text-emerald-600" aria-hidden />
        <p>
          <span className="font-medium">Why a consent checkbox?</span> Privacy laws like GDPR say people must clearly
          agree before you email them, and you must be able to prove it. Klyve records when, where and with which
          wording each person signed up, so you have that proof.
        </p>
      </div>
    </div>
  );
}

// ── After sign-up ───────────────────────────────────────────────────────────

/** "https://example.com/thanks" yes; "example.com" or "https://" no. Same rule as the server (lib/forms/queries.ts). */
export function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0 && /^https?:\/\//i.test(value);
  } catch {
    return false;
  }
}

export function AfterSignupEditor({
  config,
  onChange,
  doubleOptIn,
}: {
  config: FormConfig;
  onChange: ConfigChange;
  doubleOptIn: boolean;
}) {
  const [mode, setMode] = useState<"message" | "redirect">(config.redirectUrl ? "redirect" : "message");
  // Remembers the address while "Show a message" is picked, so switching back restores it.
  const lastUrl = useRef(config.redirectUrl);

  function choose(next: "message" | "redirect") {
    setMode(next);
    if (next === "message") {
      lastUrl.current = config.redirectUrl || lastUrl.current;
      onChange({ redirectUrl: "" });
    } else {
      onChange({ redirectUrl: lastUrl.current });
    }
  }

  const url = config.redirectUrl.trim();
  const urlError = url && !isWebAddress(url) ? "Use a full web address, like https://example.com/thanks" : null;

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">After someone signs up</legend>
        <ModeOption
          name="after-mode"
          checked={mode === "message"}
          onSelect={() => choose("message")}
          title="Show a thank-you message"
          text="Shown right where the form was."
        />
        <ModeOption
          name="after-mode"
          checked={mode === "redirect"}
          onSelect={() => choose("redirect")}
          title="Go to a page"
          text="Send people to a page on your website."
        />
      </fieldset>

      {mode === "message" ? (
        <>
          <TextField
            id="form-success-title"
            label="Thank-you title"
            value={config.successTitle}
            max={120}
            onChange={(successTitle) => onChange({ successTitle })}
            error={config.successTitle.trim() === "" ? "Add a short title, e.g. “Thanks for signing up!”" : null}
          />
          <TextField
            id="form-success-message"
            label="Thank-you message"
            value={config.successMessage}
            max={500}
            multiline
            onChange={(successMessage) => onChange({ successMessage })}
            hint={doubleOptIn ? "Double opt-in is on, so remind people to check their inbox for the confirmation email." : undefined}
          />
        </>
      ) : (
        <TextField
          id="form-redirect"
          label="Web address"
          value={config.redirectUrl}
          max={2000}
          onChange={(redirectUrl) => onChange({ redirectUrl: redirectUrl.trim() })}
          placeholder="https://example.com/thanks"
          error={urlError}
          hint={url ? undefined : "Until you add an address, people see the thank-you message."}
        />
      )}
    </div>
  );
}

function ModeOption({
  name,
  checked,
  onSelect,
  title,
  text,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  text: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-emerald-500/40",
        checked ? "border-emerald-500 bg-emerald-50/50" : "hover:border-zinc-300",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-0.5 accent-emerald-600" />
      <span className="block min-w-0">
        <span className="block text-sm font-medium text-zinc-900">{title}</span>
        <span className="mt-0.5 block text-xs text-zinc-500">{text}</span>
      </span>
    </label>
  );
}

// ── Lists ───────────────────────────────────────────────────────────────────

export function ListsEditor({
  lists,
  value,
  onChange,
}: {
  lists: { id: string; name: string }[];
  value: string[];
  onChange: (listIds: string[]) => void;
}) {
  if (lists.length === 0) {
    return (
      <div className="flex flex-col gap-3 text-sm text-zinc-600">
        <p>You don&apos;t have any lists yet. New sign-ups are still saved as contacts.</p>
        <Link href="/contacts/lists" className="w-fit font-medium text-emerald-700 underline-offset-2 hover:underline">
          Create a list
        </Link>
      </div>
    );
  }
  const chosen = new Set(value);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {lists.map((list) => {
          const id = `form-list-${list.id}`;
          return (
            <li key={list.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-zinc-50">
              <Checkbox
                id={id}
                checked={chosen.has(list.id)}
                onCheckedChange={(checked) =>
                  onChange(checked ? [...value, list.id] : value.filter((v) => v !== list.id))
                }
              />
              <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer py-0.5 font-normal break-words">
                {list.name}
              </Label>
            </li>
          );
        })}
      </ul>
      {value.length === 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
          <CircleAlert className="mt-px size-3.5 shrink-0 text-amber-600" aria-hidden />
          No list chosen: new sign-ups will be added as contacts but not to any list.
        </p>
      )}
    </div>
  );
}

// ── Style ───────────────────────────────────────────────────────────────────

export function StyleEditor({
  style,
  onChange,
  hasLogo,
}: {
  style: FormConfig["style"];
  onChange: (style: FormConfig["style"]) => void;
  hasLogo: boolean;
}) {
  const set = (patch: Partial<FormConfig["style"]>) => onChange({ ...style, ...patch });
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <ColorField id="form-accent" label="Button colour" value={style.accentColor} onChange={(accentColor) => set({ accentColor })} hint="Button and highlights." />
        <ColorField id="form-bg" label="Background" value={style.backgroundColor} onChange={(backgroundColor) => set({ backgroundColor })} hint="Behind the form." />
        <ColorField id="form-text" label="Text colour" value={style.textColor} onChange={(textColor) => set({ textColor })} hint="Titles and labels." />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium text-zinc-900">Layout</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <ModeOption
            name="form-layout"
            checked={style.layout === "card"}
            onSelect={() => set({ layout: "card" })}
            title="Card"
            text="A box with rounded corners and a soft shadow. Stands out on any page."
          />
          <ModeOption
            name="form-layout"
            checked={style.layout === "plain"}
            onSelect={() => set({ layout: "plain" })}
            title="Plain"
            text="No box: blends into your website. Match the background to your page."
          />
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <BuilderSwitch
          label="Show logo"
          description={
            hasLogo ? "Your brand kit logo, above the title." : "No logo uploaded yet, so your company name shows instead."
          }
          checked={style.showLogo}
          onCheckedChange={(showLogo) => set({ showLogo })}
        />
        {!hasLogo && (
          <Link href="/settings/brand" className="ml-12 w-fit text-xs font-medium text-emerald-700 underline-offset-2 hover:underline">
            Add a logo in Brand kit
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Status ──────────────────────────────────────────────────────────────────

export function StatusEditor({
  status,
  onChange,
  doubleOptIn,
}: {
  status: "ACTIVE" | "PAUSED";
  onChange: (status: "ACTIVE" | "PAUSED") => void;
  doubleOptIn: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <BuilderSwitch
        label="Accepting sign-ups"
        description={
          status === "ACTIVE"
            ? "The form is live: anyone with the link or embed can sign up."
            : "Paused: visitors see a short “not accepting sign-ups right now” note instead of the form."
        }
        checked={status === "ACTIVE"}
        onCheckedChange={(on) => onChange(on ? "ACTIVE" : "PAUSED")}
      />
      <div className="flex gap-2.5 rounded-lg border bg-zinc-50/60 p-3 text-xs text-zinc-700">
        {doubleOptIn ? (
          <MailCheck className="mt-px size-4 shrink-0 text-emerald-600" aria-hidden />
        ) : (
          <Info className="mt-px size-4 shrink-0 text-zinc-500" aria-hidden />
        )}
        <p>
          {doubleOptIn ? (
            <>
              <span className="font-medium text-zinc-900">Double opt-in is ON:</span> new sign-ups get a confirmation
              email first, and only join your list after they click the link.
            </>
          ) : (
            <>
              <span className="font-medium text-zinc-900">Double opt-in is OFF:</span> new sign-ups join your list
              straight away. Turning it on keeps fake and mistyped addresses out.
            </>
          )}{" "}
          <Link href="/settings/compliance" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
            Change in Compliance settings
          </Link>
        </p>
      </div>
    </div>
  );
}
