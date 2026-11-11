"use client";

import { useState, useTransition } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { setContactStatus } from "@/app/actions/contacts";
import { CONTACT_STATUS_META, type ContactStatusValue } from "@/lib/contacts/common";
import { ContactStatusBadge } from "@/components/contacts/contact-status-badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

// Why a blocked contact can't be emailed, in plain words.
const BLOCKED_REASON: Partial<Record<ContactStatusValue, string>> = {
  BOUNCED:
    "Email to this address bounced, so it probably doesn't exist or can't receive mail. Sending to it again hurts your sender reputation.",
  COMPLAINED:
    "This person marked one of your emails as spam. Emailing them again can get your sending account suspended.",
};

/** Shows the contact's status and lets the user subscribe / unsubscribe them. */
export function ContactStatusCard({
  contactId,
  status,
}: {
  contactId: string;
  status: ContactStatusValue;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const blockedReason = BLOCKED_REASON[status];

  function change(next: "SUBSCRIBED" | "UNSUBSCRIBED", overrideBlocked = false) {
    startTransition(async () => {
      try {
        const result = await setContactStatus({ contactId, status: next, overrideBlocked });
        if (result.ok) {
          toast.success(result.message);
          setConfirmOpen(false);
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <ContactStatusBadge status={status} />
        {pending && <Loader2 className="size-4 animate-spin text-zinc-400" aria-label="Saving" />}
      </div>
      <p className="text-sm text-zinc-500">{CONTACT_STATUS_META[status].description}</p>

      {blockedReason && (
        <div className="flex gap-2.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-600/20 ring-inset">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <p>{blockedReason}</p>
        </div>
      )}

      {status === "SUBSCRIBED" && (
        <Button variant="outline" disabled={pending} onClick={() => change("UNSUBSCRIBED")}>
          Unsubscribe
        </Button>
      )}
      {status === "UNSUBSCRIBED" && (
        <Button variant="outline" disabled={pending} onClick={() => change("SUBSCRIBED")}>
          Mark as subscribed
        </Button>
      )}
      {blockedReason && (
        <>
          <Button variant="outline" disabled={pending} onClick={() => setConfirmOpen(true)}>
            Mark as subscribed
          </Button>
          <AlertDialog open={confirmOpen} onOpenChange={(open) => !pending && setConfirmOpen(open)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-amber-50 text-amber-600">
                  <TriangleAlert />
                </AlertDialogMedia>
                <AlertDialogTitle>Re-subscribe this contact?</AlertDialogTitle>
                <AlertDialogDescription>
                  {blockedReason} Only do this if you&apos;re sure the address now works and the
                  person wants your emails.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                <Button variant="destructive" disabled={pending} onClick={() => change("SUBSCRIBED", true)}>
                  {pending && <Loader2 className="animate-spin" aria-hidden />}
                  Yes, mark as subscribed
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
