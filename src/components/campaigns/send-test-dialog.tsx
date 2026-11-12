"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { sendCampaignTestAction } from "@/app/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * "Send a test email" for a campaign: same design, subject and sender as the
 * real thing, sent to one address. `beforeSend` lets the page save first, so
 * the test always shows the latest changes.
 */
export function CampaignTestDialog({
  campaignId,
  senderLabel,
  defaultTo,
  open,
  onOpenChange,
  beforeSend,
}: {
  campaignId: string;
  /** "Acme <news@acme.com>", or null when no sender is picked yet. */
  senderLabel: string | null;
  defaultTo: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beforeSend?: () => Promise<boolean>;
}) {
  const [pending, startTransition] = useTransition();
  const [to, setTo] = useState(defaultTo);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (beforeSend && !(await beforeSend())) {
          return setError("Your latest changes couldn't be saved, so the test wasn't sent. Try again in a moment.");
        }
        const result = await sendCampaignTestAction(campaignId, { to });
        if (!result.ok) return setError(result.message);
        toast.success(result.message || `Test email sent to ${to.trim()}.`);
        onOpenChange(false);
      } catch {
        setError("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
          <DialogDescription>
            See exactly how this campaign looks in a real inbox before it goes to everyone.
            {!beforeSend && " It uses the last saved version (the editor saves a few seconds after each change)."}
          </DialogDescription>
        </DialogHeader>

        {!senderLabel ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Choose who it&apos;s from first (the <span className="font-medium">Sender</span> step). Tests are sent from the
            same address as the campaign.{" "}
            <Link href="/settings/senders" className="font-medium underline underline-offset-2">
              Manage senders
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <p className="text-sm text-zinc-600">
              From <span className="font-medium break-all text-zinc-900">{senderLabel}</span>
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="campaign-test-to">Send to</Label>
              <Input
                id="campaign-test-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                maxLength={254}
                autoComplete="email"
                required
                disabled={pending}
                aria-invalid={error ? true : undefined}
                aria-describedby="campaign-test-help"
              />
              <p id="campaign-test-help" className="text-xs text-zinc-500">
                The subject starts with “[Test]”. If this address is one of your contacts, it&apos;s personalized with their
                details; otherwise with sample details.
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
              <Button type="submit" disabled={pending || !to.trim()}>
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
