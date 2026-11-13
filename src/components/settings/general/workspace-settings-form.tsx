"use client";

import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateWorkspaceSettingsAction, type WorkspaceSettingsInput } from "@/app/actions/workspace";
import { useNow } from "@/components/settings/senders/use-now";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  formatDateTime,
  type DateFormat,
  type DatePrefs,
  type TimeFormat,
} from "@/lib/format-date";
import { TimeZoneSelect, type TimeZoneOption } from "./time-zone-select";

// Settings → General, for owners and admins: workspace name, time zone and
// how dates and times are written. Everyone in the workspace sees dates this way.

type Values = { name: string; timezone: string; dateFormat: DateFormat; timeFormat: TimeFormat };
type FieldErrors = Partial<Record<keyof WorkspaceSettingsInput, string>>;

export function WorkspaceSettingsForm({ initial, timeZones }: { initial: Values; timeZones: TimeZoneOption[] }) {
  const [values, setValues] = useState<Values>(initial);
  const [saved, setSaved] = useState<Values>(initial);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = { name: useId(), timezone: useId(), dateFormat: useId(), timeFormat: useId() };

  const changed = (Object.keys(values) as (keyof Values)[]).some((k) => values[k] !== saved[k]);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (values.name.trim().length < 2) {
      setFieldErrors({ name: "Workspace name must be at least 2 characters." });
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateWorkspaceSettingsAction(values);
        if (!result.ok) {
          setError(result.error);
          setFieldErrors(result.fieldErrors ?? {});
          return;
        }
        const next = { ...values, name: values.name.trim() };
        setValues(next);
        setSaved(next);
        toast.success("Settings saved.");
      } catch {
        setError("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="divide-y">
      <Row label="Workspace name" htmlFor={ids.name} error={fieldErrors.name}>
        <Input
          id={ids.name}
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          maxLength={50}
          autoComplete="organization"
          disabled={pending}
          className="h-9 bg-white"
          aria-invalid={fieldErrors.name ? true : undefined}
        />
      </Row>

      <Row
        label="Time zone"
        htmlFor={ids.timezone}
        error={fieldErrors.timezone}
        hint="Used for every date and time on screen, and for daily statistics."
      >
        <TimeZoneSelect
          id={ids.timezone}
          options={timeZones}
          value={values.timezone}
          onChange={(tz) => set("timezone", tz)}
          disabled={pending}
          invalid={Boolean(fieldErrors.timezone)}
        />
      </Row>

      <Row label="Date format" htmlFor={ids.dateFormat} error={fieldErrors.dateFormat}>
        <Select
          items={DATE_FORMAT_OPTIONS}
          value={values.dateFormat}
          onValueChange={(v) => (v === "DMY" || v === "MDY" || v === "YMD") && set("dateFormat", v)}
          disabled={pending}
        >
          <SelectTrigger id={ids.dateFormat} className="h-9 w-full bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_FORMAT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row label="Time format" htmlFor={ids.timeFormat} error={fieldErrors.timeFormat}>
        <Select
          items={TIME_FORMAT_OPTIONS}
          value={values.timeFormat}
          onValueChange={(v) => (v === "24h" || v === "12h") && set("timeFormat", v)}
          disabled={pending}
        >
          <SelectTrigger id={ids.timeFormat} className="h-9 w-full bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_FORMAT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <NowPreview prefs={values} />
        <div className="flex items-center gap-3">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending || !changed}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** "Right now it's 14 Nov 2026, 17:30 there", updating as the settings change. */
function NowPreview({ prefs }: { prefs: DatePrefs }) {
  // null on the server (its clock may differ from the browser's), then ticking.
  const now = useNow();
  return (
    <p className="text-sm text-zinc-500" aria-live="polite">
      Right now:{" "}
      <span className="font-medium text-zinc-900">{now === null ? "…" : formatDateTime(new Date(now), prefs)}</span>
    </p>
  );
}

function Row({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-start sm:gap-4">
      <Label htmlFor={htmlFor} className="w-40 shrink-0 pt-2 text-sm font-normal text-zinc-500">
        {label}
      </Label>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-md">
        {children}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          hint && <p className="text-xs text-zinc-500">{hint}</p>
        )}
      </div>
    </div>
  );
}
