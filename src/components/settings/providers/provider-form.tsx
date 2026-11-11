"use client";

import { useState, useTransition, type ComponentProps, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, CircleAlert, CircleCheck, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createProviderAction,
  updateProviderAction,
  type ProviderCheckOutcome,
} from "@/app/actions/providers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVIDERS, type ProviderField, type ProviderTypeValue, type SmtpPreset } from "@/lib/email/provider-configs";
import { cn } from "@/lib/utils";
import { MAX_PER_SECOND_MAX, MAX_PER_SECOND_MIN, PROVIDER_NAME_MAX, smtpPresets } from "./provider-rules";

type ConfigValues = Record<string, string | boolean>;

/** Starting values for the form. Secret fields are NEVER included. */
export type ProviderFormInitial = {
  name: string;
  maxPerSecond: string;
  dailyLimit: string;
  values: ConfigValues;
};

export type ProviderSaved = { providerId: string; name: string; test: ProviderCheckOutcome };

const CUSTOM = "custom";

/** Empty values for a brand-new provider of `type`. */
export function blankInitial(type: ProviderTypeValue): ProviderFormInitial {
  const def = PROVIDERS[type];
  const values: ConfigValues = {};
  for (const field of def.fields) {
    if (field.kind === "checkbox") values[field.name] = false;
    else if (field.kind === "select") values[field.name] = field.options?.[0]?.value ?? "";
    else values[field.name] = "";
  }
  return { name: def.label, maxPerSecond: String(def.defaultMaxPerSecond), dailyLimit: "", values };
}

/**
 * The add/edit form for one provider, generated from PROVIDERS[type].fields.
 *
 * Secrets: in edit mode the password/API key inputs start EMPTY (the server
 * never sends them to the browser). Leaving them blank keeps the stored value.
 * The form keeps its values in React state and calls the Server Action
 * directly, so a validation error never wipes what the user typed.
 */
export function ProviderForm({
  type,
  providerId,
  initial,
  showDevPresets,
  onBack,
  onSaved,
}: {
  type: ProviderTypeValue;
  /** Set when editing an existing provider. */
  providerId?: string;
  initial: ProviderFormInitial;
  showDevPresets: boolean;
  onBack?: () => void;
  onSaved: (saved: ProviderSaved) => void;
}) {
  const def = PROVIDERS[type];
  const editing = Boolean(providerId);
  const presets = type === "SMTP" ? smtpPresets(showDevPresets) : [];

  const [name, setName] = useState(initial.name);
  const [nameTouched, setNameTouched] = useState(editing);
  const [maxPerSecond, setMaxPerSecond] = useState(initial.maxPerSecond);
  const [dailyLimit, setDailyLimit] = useState(initial.dailyLimit);
  const [values, setValues] = useState<ConfigValues>(initial.values);
  const [presetId, setPresetId] = useState(() => findPreset(presets, initial.values)?.id ?? CUSTOM);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [lastTest, setLastTest] = useState<ProviderCheckOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  const preset = presets.find((p) => p.id === presetId);
  const idPrefix = providerId ? `provider-${providerId}` : `provider-new-${type.toLowerCase()}`;

  function setValue(field: string, value: string | boolean) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function choosePreset(id: string) {
    setPresetId(id);
    const chosen = presets.find((p) => p.id === id);
    if (!chosen) return; // "Custom": keep whatever is there
    setValues((prev) => {
      const next: ConfigValues = { ...prev, host: chosen.host, port: String(chosen.port), secure: chosen.secure };
      // Mailpit accepts any login, so fill one in to save typing (dev only).
      if (chosen.id === "mailpit") {
        if (!prev.username) next.username = "test@klyve.local";
        if (!prev.password && !editing) next.password = "mailpit";
      }
      return next;
    });
    // Suggest the service's speed and daily limit.
    setMaxPerSecond(String(chosen.maxPerSecond));
    setDailyLimit(chosen.dailyLimit ? String(chosen.dailyLimit) : "");
    if (!nameTouched) setName(chosen.label);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setLastTest(null);
    const input = { name, maxPerSecond, dailyLimit, config: values };

    startTransition(async () => {
      const result = providerId
        ? await updateProviderAction(providerId, input)
        : await createProviderAction(type, input);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.message ?? (result.errors ? "Please fix the highlighted fields." : null));
        return;
      }

      setErrors({});
      // Forget the secrets we just sent; they're stored (encrypted) on the server now.
      setValues((prev) => {
        const next = { ...prev };
        for (const field of def.fields) if (field.secret) next[field.name] = "";
        return next;
      });
      setLastTest(result.test);
      if (result.test.ok) toast.success(`“${name.trim()}” saved and connected`);
      else toast.error(`“${name.trim()}” saved, but the connection test failed`, { description: result.test.error });
      onSaved({ providerId: result.providerId, name: name.trim(), test: result.test });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-1 rounded-xl border bg-white">
        <div className="flex flex-col gap-1 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold text-zinc-900">{def.label}</h2>
            <p className="text-sm text-zinc-500">{def.description}</p>
          </div>
          <a
            href={def.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-700 hover:underline"
          >
            Where do I find these?
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          {type === "SMTP" && (
            <PresetPicker presets={presets} value={presetId} onChange={choosePreset} disabled={pending} />
          )}
          {preset && (
            <p className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              <Info className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              <span>{preset.note}</span>
            </p>
          )}

          <TextField
            id={`${idPrefix}-name`}
            label="Name"
            help="Only you see this, e.g. “Company SES” or “My Gmail”."
            value={name}
            onChange={(v) => {
              setName(v);
              setNameTouched(true);
            }}
            errors={errors.name}
            disabled={pending}
            maxLength={PROVIDER_NAME_MAX}
          />

          {def.fields.map((field) => (
            <ConfigField
              key={field.name}
              idPrefix={idPrefix}
              field={field}
              value={values[field.name]}
              onChange={(v) => {
                setValue(field.name, v);
                // Typing your own host means it's no longer the preset.
                if (type === "SMTP" && ["host", "port", "secure"].includes(field.name)) setPresetId(CUSTOM);
              }}
              errors={errors[`config.${field.name}`]}
              disabled={pending}
              editing={editing}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-xl border bg-white">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold text-zinc-900">Sending limits</h2>
          <p className="text-sm text-zinc-500">
            Klyve never adds a cap of its own. These just keep you inside your provider&apos;s limits.
          </p>
        </div>
        <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
          <TextField
            id={`${idPrefix}-max-per-second`}
            label="Emails per second"
            help={`Between ${MAX_PER_SECOND_MIN} and ${MAX_PER_SECOND_MAX}. Start low if you're not sure.`}
            inputMode="numeric"
            type="number"
            min={MAX_PER_SECOND_MIN}
            max={MAX_PER_SECOND_MAX}
            value={maxPerSecond}
            onChange={setMaxPerSecond}
            errors={errors.maxPerSecond}
            disabled={pending}
          />
          <TextField
            id={`${idPrefix}-daily-limit`}
            label="Daily limit (optional)"
            help="Leave blank for no daily limit."
            inputMode="numeric"
            type="number"
            min={1}
            value={dailyLimit}
            onChange={setDailyLimit}
            errors={errors.dailyLimit}
            disabled={pending}
            placeholder="No limit"
          />
        </div>
      </div>

      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      {lastTest && editing && <TestResultBanner result={lastTest} />}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={pending} className="self-start">
            <ArrowLeft aria-hidden />
            Choose another type
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="bg-emerald-600 px-4 text-white hover:bg-emerald-700"
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Saving and testing…" : editing ? "Save and test" : "Save and test connection"}
        </Button>
      </div>
    </form>
  );
}

/** Green "Connected" / red "Failed: reason" box shown after a save. */
export function TestResultBanner({ result, className }: { result: ProviderCheckOutcome; className?: string }) {
  return (
    <div
      role={result.ok ? "status" : "alert"}
      className={cn(
        "flex gap-3 rounded-xl p-4 text-sm",
        result.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900",
        className,
      )}
    >
      {result.ok ? (
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden />
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-medium">{result.ok ? "Connection works" : "Saved, but the connection test failed"}</p>
        <p className="break-words">
          {result.ok
            ? (result.detail ?? "Klyve could log in to your provider.")
            : `${result.error} The provider is kept and marked as Failed until a test succeeds.`}
        </p>
      </div>
    </div>
  );
}

function findPreset(presets: SmtpPreset[], values: ConfigValues): SmtpPreset | undefined {
  return presets.find(
    (p) => p.host === values.host && String(p.port) === String(values.port) && p.secure === values.secure,
  );
}

function PresetPicker({
  presets,
  value,
  onChange,
  disabled,
}: {
  presets: SmtpPreset[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const options = [...presets.map((p) => ({ id: p.id, label: p.label })), { id: CUSTOM, label: "Custom" }];
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-zinc-900">Which email service?</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              aria-pressed={selected}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                selected
                  ? "border-emerald-500 bg-emerald-50 font-medium text-emerald-900 ring-1 ring-emerald-500"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-300",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ConfigField({
  idPrefix,
  field,
  value,
  onChange,
  errors,
  disabled,
  editing,
}: {
  idPrefix: string;
  field: ProviderField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
  errors?: string[];
  disabled: boolean;
  editing: boolean;
}) {
  const id = `${idPrefix}-${field.name}`;
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;

  if (field.kind === "checkbox") {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2.5">
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
            disabled={disabled}
            className="mt-0.5"
          />
          <Label htmlFor={id} className="font-normal leading-snug">
            {field.label}
          </Label>
        </div>
        {field.help && <p className="pl-6.5 text-xs text-zinc-500">{field.help}</p>}
        <FieldErrors id={errorId} errors={errors} />
      </div>
    );
  }

  if (field.kind === "select") {
    const options = field.options ?? [];
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{field.label}</Label>
        <Select
          items={options}
          value={typeof value === "string" && value ? value : null}
          onValueChange={(v) => onChange(typeof v === "string" ? v : "")}
          disabled={disabled}
        >
          <SelectTrigger id={id} className="w-full sm:w-72" aria-invalid={errors ? true : undefined}>
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.help && <p className="text-xs text-zinc-500">{field.help}</p>}
        <FieldErrors id={errorId} errors={errors} />
      </div>
    );
  }

  // Secrets on the edit page start empty; blank means "keep the current one".
  const secretOnEdit = Boolean(field.secret && editing);
  const help = [secretOnEdit ? "Leave blank to keep the current value." : null, field.help ?? null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {field.label}
        {field.optional && <span className="font-normal text-zinc-400">(optional)</span>}
      </Label>
      <Input
        id={id}
        type={field.kind === "password" ? "password" : field.kind === "number" ? "number" : "text"}
        inputMode={field.kind === "number" ? "numeric" : undefined}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={secretOnEdit ? "••••••••  (unchanged)" : field.placeholder}
        // Stop browsers from autofilling the user's own Klyve password here.
        autoComplete={field.kind === "password" ? "new-password" : "off"}
        spellCheck={false}
        readOnly={disabled}
        aria-invalid={errors ? true : undefined}
        aria-describedby={[errors ? errorId : null, help ? helpId : null].filter(Boolean).join(" ") || undefined}
        className={field.kind === "number" ? "sm:w-40" : undefined}
      />
      {help && (
        <p id={helpId} className="text-xs text-zinc-500">
          {help}
        </p>
      )}
      <FieldErrors id={errorId} errors={errors} />
    </div>
  );
}

function TextField({
  id,
  label,
  help,
  value,
  onChange,
  errors,
  disabled,
  ...inputProps
}: {
  id: string;
  label: string;
  help?: string;
  value: string;
  onChange: (value: string) => void;
  errors?: string[];
  disabled: boolean;
} & Omit<ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        readOnly={disabled}
        aria-invalid={errors ? true : undefined}
        aria-describedby={[errors ? errorId : null, help ? helpId : null].filter(Boolean).join(" ") || undefined}
        {...inputProps}
      />
      {help && (
        <p id={helpId} className="text-xs text-zinc-500">
          {help}
        </p>
      )}
      <FieldErrors id={errorId} errors={errors} />
    </div>
  );
}

function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {errors[0]}
    </p>
  );
}
