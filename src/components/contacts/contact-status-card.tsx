"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Loader2, MailCheck, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { setContactStatus } from "@/app/actions/contacts";
import { getPendingContactInfo, markContactAsConfirmed, resendOptInEmail, type PendingInfo } from "@/app/actions/optin";
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
        // The action explains any refusal (e.g. the address is on the
        // suppression list), so its message is shown as it is.
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

      {status === "PENDING" && <PendingConfirmation contactId={contactId} />}

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

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Double opt-in: the contact hasn't clicked the confirmation link yet.
 * Shows when the email went out, a "Resend" button (the server enforces
 * 1 per 10 minutes and 3 per day) and, for owners and admins, "Mark as
 * confirmed" for people who agreed some other way.
 */
function PendingConfirmation({ contactId }: { contactId: string }) {
  const [info, setInfo] = useState<PendingInfo | null>(null);
  const [busy, startBusy] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Loaded here (not passed in by the page) so the contact page doesn't need
  // to know about double opt-in.
  const load = useCallback(() => {
    getPendingContactInfo(contactId)
      .then(setInfo)
      .catch(() => setInfo({ ok: false, message: "Couldn't load the confirmation details." }));
  }, [contactId]);
  useEffect(load, [load]);

  function resend() {
    startBusy(async () => {
      try {
        const result = await resendOptInEmail(contactId);
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
      load();
    });
  }

  function markConfirmed() {
    startBusy(async () => {
      try {
        const result = await markContactAsConfirmed(contactId);
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

  if (!info) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
      </p>
    );
  }
  if (!info.ok) return <p className="text-sm text-red-600">{info.message}</p>;

  const waitUntil = info.resendAt ? new Date(info.resendAt) : null;

  return (
    <>
      <div className="flex gap-2.5 rounded-lg bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-600/20 ring-inset">
        <MailCheck className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden />
        <p>
          Awaiting confirmation
          {info.sentAt ? (
            <>
              {" · sent "}
              <time dateTime={info.sentAt}>{dateTimeFormat.format(new Date(info.sentAt))}</time>
            </>
          ) : (
            " · no confirmation email sent yet"
          )}
        </p>
      </div>

      <Button variant="outline" disabled={busy} onClick={resend}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        Resend confirmation email
      </Button>
      {waitUntil && (
        <p className="-mt-1 text-xs text-zinc-500">
          To protect their inbox, you can resend after {dateTimeFormat.format(waitUntil)}.
        </p>
      )}

      {info.canConfirm && (
        <>
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmOpen(true)}>
            Mark as confirmed
          </Button>
          <AlertDialog open={confirmOpen} onOpenChange={(open) => !busy && setConfirmOpen(open)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-amber-50 text-amber-600">
                  <TriangleAlert />
                </AlertDialogMedia>
                <AlertDialogTitle>Mark as confirmed without the link?</AlertDialogTitle>
                <AlertDialogDescription>
                  Only do this if you have your own proof that this person agreed to receive your emails (for
                  example a signed form or a written request). They&apos;ll start receiving your campaigns, and your
                  name is saved in their consent record.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <Button disabled={busy} onClick={markConfirmed}>
                  {busy && <Loader2 className="animate-spin" aria-hidden />}
                  Yes, I have proof of consent
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
}
