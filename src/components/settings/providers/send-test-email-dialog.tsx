"use client";

import { useState, useTransition, type FormEvent } from "react";
import { CircleAlert, CircleCheck, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { sendTestEmailAction, type ProviderCheckOutcome } from "@/app/actions/providers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProviderTypeValue } from "@/lib/email/provider-configs";
import { needsVerifiedFrom, providerLabel, TEST_EMAILS_PER_HOUR } from "./provider-rules";

export type TestEmailTarget = {
  id: string;
  name: string;
  type: ProviderTypeValue;
  /** Our best guess for the From address (see suggestedTestFrom). */
  suggestedFrom: string;
};

/** Dialog that sends the "It works!" email through one provider. */
export function SendTestEmailDialog({
  provider,
  userEmail,
  open,
  onOpenChange,
}: {
  provider: TestEmailTarget;
  userEmail: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
          <DialogDescription>
            We&apos;ll send a short email through “{provider.name}” so you can check it arrives.
          </DialogDescription>
        </DialogHeader>
        {/* Inside the dialog, so the form starts fresh each time it opens. */}
        <TestEmailForm provider={provider} userEmail={userEmail} />
      </DialogContent>
    </Dialog>
  );
}

function TestEmailForm({ provider, userEmail }: { provider: TestEmailTarget; userEmail: string }) {
  const [to, setTo] = useState(userEmail);
  const [from, setFrom] = useState(provider.suggestedFrom);
  const [result, setResult] = useState<ProviderCheckOutcome | null>(null);
  const [pending, startTransition] = useTransition();
  const askFrom = needsVerifiedFrom(provider.type);
  const idPrefix = `test-email-${provider.id}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    startTransition(async () => {
      const outcome = await sendTestEmailAction(provider.id, { to, from: askFrom ? from : undefined });
      setResult(outcome);
      if (outcome.ok) toast.success("Test email sent", { description: outcome.detail });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-to`}>Send to</Label>
        <Input
          id={`${idPrefix}-to`}
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          autoComplete="email"
          required
          readOnly={pending}
        />
      </div>

      {askFrom ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-from`}>From address</Label>
          <Input
            id={`${idPrefix}-from`}
            type="email"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
            readOnly={pending}
            aria-describedby={`${idPrefix}-from-help`}
          />
          <p id={`${idPrefix}-from-help`} className="text-xs text-zinc-500">
            Must be an address or domain you verified with {providerLabel(provider.type)}.
          </p>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">
          Sent from <span className="font-medium text-zinc-700">{provider.suggestedFrom}</span>. Most SMTP servers only
          let you send as the account you logged in with.
        </p>
      )}

      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={
            result.ok
              ? "flex gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
              : "flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"
          }
        >
          {result.ok ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <span className="min-w-0 break-words">
            {result.ok ? `${result.detail ?? "Sent."} Check the inbox (and the spam folder).` : result.error}
          </span>
        </div>
      )}

      <p className="text-xs text-zinc-400">You can send up to {TEST_EMAILS_PER_HOUR} test emails per provider each hour.</p>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
          {result?.ok ? "Done" : "Cancel"}
        </DialogClose>
        <Button type="submit" disabled={pending} className="bg-emerald-600 text-white hover:bg-emerald-700">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {pending ? "Sending…" : result ? "Send again" : "Send test email"}
        </Button>
      </DialogFooter>
    </form>
  );
}
