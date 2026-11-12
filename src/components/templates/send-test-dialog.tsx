"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { sendTemplateTest } from "@/app/actions/templates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SenderOption = { id: string; label: string };

/** "Send test email": pick a verified sender, type a recipient, send. */
export function SendTestDialog({
  templateId,
  senders,
  defaultTo,
  open,
  onOpenChange,
}: {
  templateId: string;
  senders: SenderOption[];
  defaultTo: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [senderId, setSenderId] = useState(senders[0]?.id ?? "");
  const [to, setTo] = useState(defaultTo);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await sendTemplateTest(templateId, { to, senderId });
        if (!result.ok) return setError(result.error);
        toast.success(`Test email sent to ${result.to}.`);
        onOpenChange(false);
      } catch {
        setError("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
          <DialogDescription>
            See exactly how your email looks in a real inbox. Save first: the test uses the last saved version.
          </DialogDescription>
        </DialogHeader>

        {senders.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>You need a verified sender address before you can send emails.</p>
            <Link href="/settings/senders" className="font-medium text-amber-900 underline underline-offset-2">
              Add a sender in Settings
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="test-sender">From</Label>
              <Select
                items={senders.map((s) => ({ value: s.id, label: s.label }))}
                value={senderId}
                onValueChange={(v) => setSenderId(v ?? "")}
                disabled={pending}
              >
                <SelectTrigger id="test-sender" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {senders.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="test-to">Send to</Label>
              <Input
                id="test-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                maxLength={254}
                autoComplete="email"
                required
                disabled={pending}
                aria-invalid={error ? true : undefined}
                aria-describedby="test-to-help"
              />
              <p id="test-to-help" className="text-xs text-zinc-500">
                If this address is one of your contacts, the test is personalized with their details; otherwise we use
                sample details. The unsubscribe link is a placeholder in tests.
              </p>
            </div>
            {error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !senderId}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                Send test
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
