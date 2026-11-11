"use client";

import { useState, useTransition } from "react";
import { InfoIcon, PlusIcon } from "lucide-react";
import { addSender } from "@/app/actions/senders";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FREE_MAIL_NOTE, isFreeMailDomain } from "@/components/settings/domains/free-mail";
import type { SenderFieldErrors } from "@/lib/email/senders";
import { ProviderErrorBox } from "./provider-error-box";
import { ProviderSelect } from "./provider-select";
import type { ProviderOption } from "./types";
import { ResendCodeButton, VerifyCodeForm } from "./verify-code-form";

type Step =
  | { kind: "form" }
  // Saved and the code is on its way: ask for it right here.
  | { kind: "verify"; senderId: string; email: string; sentAt: string }
  // Saved, but the provider refused to send the code.
  | { kind: "failed"; senderId: string; email: string; sentAt: string; error: string; providerError?: string };

/** "Add sender" button → form → (code sent) enter the code, all in one dialog. */
export function AddSenderDialog({ providers }: { providers: ProviderOption[] }) {
  const defaultProviderId = (providers.find((p) => p.isDefault) ?? providers[0])?.id ?? "";

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [providerId, setProviderId] = useState(defaultProviderId);
  const [errors, setErrors] = useState<SenderFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStep({ kind: "form" });
    setEmail("");
    setName("");
    setReplyTo("");
    setProviderId(defaultProviderId);
    setErrors({});
    setMessage(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addSender({ email, name, replyTo, providerId });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error ?? null);
        return;
      }
      const base = { senderId: result.sender.id, email: result.sender.email, sentAt: new Date().toISOString() };
      if (result.send.ok) setStep({ kind: "verify", ...base });
      else setStep({ kind: "failed", ...base, error: result.send.error, providerError: result.send.providerError });
    });
  }

  const freeMail = email.includes("@") && isFreeMailDomain(email);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        Add sender
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {step.kind === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>Add a sender</DialogTitle>
              <DialogDescription>
                We&apos;ll email a 6-digit code to this address to confirm it&apos;s yours.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="sender-email">From email</Label>
                <Input
                  id="sender-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="news@acme.com"
                  autoComplete="off"
                  maxLength={254}
                  required
                  aria-invalid={errors.email ? true : undefined}
                />
                {errors.email && <p className="text-xs text-red-600">{errors.email[0]}</p>}
                {freeMail && <p className="text-xs text-amber-700">{FREE_MAIL_NOTE}</p>}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="sender-name">Display name</Label>
                <Input
                  id="sender-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme News"
                  autoComplete="off"
                  maxLength={70}
                  required
                  aria-invalid={errors.name ? true : undefined}
                />
                {errors.name ? (
                  <p className="text-xs text-red-600">{errors.name[0]}</p>
                ) : (
                  <p className="text-xs text-zinc-500">What people see in their inbox, e.g. “Acme News”.</p>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="sender-reply-to">
                  Reply-to <span className="font-normal text-zinc-400">(optional)</span>
                </Label>
                <Input
                  id="sender-reply-to"
                  type="email"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="support@acme.com"
                  autoComplete="off"
                  maxLength={254}
                  aria-invalid={errors.replyTo ? true : undefined}
                />
                {errors.replyTo ? (
                  <p className="text-xs text-red-600">{errors.replyTo[0]}</p>
                ) : (
                  <p className="text-xs text-zinc-500">Where replies go. Leave empty to use the From email.</p>
                )}
              </div>

              <ProviderSelect
                id="sender-provider"
                providers={providers}
                value={providerId}
                onChange={setProviderId}
                error={errors.providerId?.[0]}
              />

              <div className="flex gap-2 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
                <InfoIcon className="mt-px size-3.5 shrink-0 text-zinc-400" />
                <p>
                  Your provider must also allow this From address. Amazon SES, Resend, SendGrid, Mailgun and Postmark
                  need the domain (or the address) verified in their dashboard first. Gmail or Outlook SMTP can only
                  send as your own mailbox address or its aliases. We send the code through this provider, so
                  you&apos;ll find out straight away.
                </p>
              </div>

              {message && <p className="text-sm text-red-600">{message}</p>}

              <DialogFooter>
                <Button type="submit" disabled={pending || !email.trim() || !name.trim() || !providerId}>
                  {pending ? "Sending code…" : "Add and send code"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step.kind === "verify" && (
          <>
            <DialogHeader>
              <DialogTitle>Check your inbox</DialogTitle>
              <DialogDescription>
                {step.email} was added as a pending sender. Enter the code to start using it.
              </DialogDescription>
            </DialogHeader>
            <VerifyCodeForm
              senderId={step.senderId}
              email={step.email}
              sentAt={step.sentAt}
              onVerified={() => {
                setOpen(false);
                reset();
              }}
            />
          </>
        )}

        {step.kind === "failed" && (
          <>
            <DialogHeader>
              <DialogTitle>We couldn&apos;t send the code</DialogTitle>
              <DialogDescription>
                {step.email} was saved as a pending sender, but the verification email didn&apos;t go out.
              </DialogDescription>
            </DialogHeader>
            <ProviderErrorBox error={step.error} providerError={step.providerError} />
            <p className="text-xs text-zinc-500">
              Fix the problem in your provider, then resend the code from here or later from the Senders list.
            </p>
            <DialogFooter className="gap-2 sm:justify-between">
              <ResendCodeButton
                senderId={step.senderId}
                sentAt={step.sentAt}
                variant="outline"
                size="default"
                onSent={() => setStep({ kind: "verify", senderId: step.senderId, email: step.email, sentAt: new Date().toISOString() })}
              />
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
