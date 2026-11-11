"use client";

import { useState, useTransition } from "react";
import { RotateCwIcon } from "lucide-react";
import { toast } from "sonner";
import { resendVerificationCode, submitVerificationCode } from "@/app/actions/senders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProviderErrorBox } from "./provider-error-box";
import { RESEND_COOLDOWN_SECONDS } from "./types";
import { useCountdown } from "./use-now";

/** The 6-digit code box, plus a "Resend code" button. Used in two dialogs. */
export function VerifyCodeForm({
  senderId,
  email,
  sentAt,
  onVerified,
}: {
  senderId: string;
  email: string;
  /** When the current code was sent (ISO), for the resend countdown. */
  sentAt: string | null;
  onVerified: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsNewCode, setNeedsNewCode] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await submitVerificationCode(senderId, code);
      if (result.ok) {
        toast.success(`${email} is verified. You can now send campaigns from it.`);
        onVerified();
        return;
      }
      setError(result.error);
      if (result.needsNewCode) {
        setNeedsNewCode(true);
        setCode("");
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={`code-${senderId}`}>Verification code</Label>
        <Input
          id={`code-${senderId}`}
          value={code}
          onChange={(e) => {
            // Keep only digits, so "123 456" pasted from the email works too.
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
            setError(null);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={7}
          disabled={needsNewCode}
          className="h-11 text-center font-mono text-xl tracking-[0.4em]"
          aria-invalid={error ? true : undefined}
          aria-describedby={`code-help-${senderId}`}
          autoFocus
        />
        {error ? (
          <p className="text-xs text-red-600" role="alert">
            {error}
          </p>
        ) : (
          <p id={`code-help-${senderId}`} className="text-xs text-zinc-500">
            We emailed a 6-digit code to <span className="font-medium text-zinc-700">{email}</span>. It works for 15
            minutes. Check the spam folder if you don&apos;t see it.
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <ResendCodeButton
          senderId={senderId}
          sentAt={sentAt}
          onSent={() => {
            setNeedsNewCode(false);
            setError(null);
            setCode("");
          }}
        />
        <Button type="submit" disabled={pending || needsNewCode || code.length !== 6}>
          {pending ? "Checking…" : "Verify"}
        </Button>
      </div>
    </form>
  );
}

/** "Resend code" with the 60-second wait shown as a countdown. */
export function ResendCodeButton({
  senderId,
  sentAt,
  onSent,
  variant = "ghost",
  size = "sm",
}: {
  senderId: string;
  sentAt: string | null;
  onSent?: () => void;
  variant?: "ghost" | "outline";
  size?: "sm" | "default";
}) {
  // Remember when WE last sent, so the countdown starts instantly (the page
  // data refreshes a moment later with the same time from the server).
  const [localSentAt, setLocalSentAt] = useState<number | null>(null);
  const [failure, setFailure] = useState<{ error: string; providerError?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const serverSentAt = sentAt ? new Date(sentAt).getTime() : 0;
  const lastSent = Math.max(serverSentAt, localSentAt ?? 0) || null;
  const wait = useCountdown(lastSent, RESEND_COOLDOWN_SECONDS);

  function resend() {
    startTransition(async () => {
      const result = await resendVerificationCode(senderId);
      if (result.ok) {
        setFailure(null);
        setLocalSentAt(Date.now());
        toast.success(`New code sent to ${result.sentTo}.`);
        onSent?.();
        return;
      }
      if (result.retryAfterSeconds) {
        setLocalSentAt(Date.now() - (RESEND_COOLDOWN_SECONDS - result.retryAfterSeconds) * 1000);
      }
      if (result.providerError) {
        // The provider refused: the cooldown still applies, so start it.
        setLocalSentAt(Date.now());
        setFailure({ error: result.error, providerError: result.providerError });
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant={variant} size={size} onClick={resend} disabled={pending || wait > 0}>
        <RotateCwIcon className={pending ? "animate-spin" : undefined} />
        {pending ? "Sending…" : wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
      </Button>
      {failure && <ProviderErrorBox error={failure.error} providerError={failure.providerError} />}
    </div>
  );
}
