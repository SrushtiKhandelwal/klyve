"use client";

import { useState, useTransition, type FormEvent } from "react";
import { CircleCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { clearWebhookSecretAction, saveWebhookSecretAction } from "@/app/actions/webhooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WebhookSettings } from "@/lib/webhooks/admin";
import { WEBHOOK_GUIDES, type WebhookProviderType } from "@/lib/webhooks/setup-guide";

/**
 * The signing-secret part of the webhook card. Secrets are stored encrypted
 * and never sent back to the browser: the inputs start empty, and leaving
 * them blank keeps what's saved.
 */
export function WebhookSecretForm({
  providerId,
  type,
  settings,
}: {
  providerId: string;
  type: WebhookProviderType;
  settings: WebhookSettings;
}) {
  const guide = WEBHOOK_GUIDES[type];
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [removing, startRemove] = useTransition();
  const pending = saving || removing;
  const isSes = type === "AMAZON_SES";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startSave(async () => {
      const result = await saveWebhookSecretAction(providerId, values);
      if (!result.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      setErrors({});
      setValues({}); // forget what was typed: it's stored (encrypted) on the server now
      toast.success(isSes ? "Topic saved." : "Signing secret saved.");
    });
  }

  function remove() {
    startRemove(async () => {
      const result = await clearWebhookSecretAction(providerId);
      if (result.ok) toast.success(isSes ? "Topic lock removed." : "Signing secret removed.");
      else toast.error(result.error);
    });
  }

  // What's stored now, in words (never the secret itself).
  const savedNote = settings.secretSet
    ? isSes
      ? `Locked to ${settings.topicArn}`
      : type === "POSTMARK"
        ? `Saved (username “${settings.basicUsername}”)`
        : "Saved"
    : null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border p-4" noValidate>
      <div>
        <h3 className="text-sm font-medium text-zinc-900">{guide.secretTitle}</h3>
        <p className="text-sm text-zinc-500">{guide.secretDescription}</p>
        {savedNote && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm break-all text-emerald-700">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            {savedNote}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {guide.secretFields.map((field) => {
          const id = `webhook-secret-${field.name}`;
          const fieldErrors = errors[field.name];
          return (
            <div key={field.name} className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor={id}>{field.label}</Label>
              <Input
                id={id}
                type={field.masked ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                placeholder={settings.secretSet ? "Leave blank to keep" : field.placeholder}
                disabled={pending}
                aria-invalid={fieldErrors ? true : undefined}
                aria-describedby={fieldErrors ? `${id}-error` : field.help ? `${id}-help` : undefined}
                className="font-mono text-xs sm:max-w-xl"
              />
              {field.help && !fieldErrors && (
                <p id={`${id}-help`} className="text-xs text-zinc-500">
                  {field.help}
                </p>
              )}
              {fieldErrors && (
                <p id={`${id}-error`} className="text-xs text-destructive">
                  {fieldErrors.join(" ")}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending} className="bg-emerald-600 text-white hover:bg-emerald-700">
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {saving ? "Saving…" : "Save"}
        </Button>
        {settings.secretSet && (
          <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={pending}>
            {removing && <Loader2 className="animate-spin" aria-hidden />}
            Remove
          </Button>
        )}
      </div>
    </form>
  );
}
