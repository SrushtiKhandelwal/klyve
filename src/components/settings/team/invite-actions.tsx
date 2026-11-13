"use client";

import { useState, useTransition } from "react";
import { BanIcon, Loader2, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { resendInviteAction, revokeInviteAction } from "@/app/actions/team";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

// "Resend" and "Revoke" on one pending invite (owners and admins).

export function InviteActions({ inviteId, email, expired }: { inviteId: string; email: string; expired: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <ResendButton inviteId={inviteId} email={email} expired={expired} />
      <RevokeButton inviteId={inviteId} email={email} />
    </div>
  );
}

function ResendButton({ inviteId, email, expired }: { inviteId: string; email: string; expired: boolean }) {
  const [pending, startTransition] = useTransition();

  function resend() {
    startTransition(async () => {
      try {
        const result = await resendInviteAction(inviteId);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`New invite sent to ${email}. It works for 7 days.`);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={resend}
      disabled={pending}
      title={expired ? "Send a new link that works for 7 days" : "Send the invite again with a new link"}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <SendIcon aria-hidden />}
      Resend
    </Button>
  );
}

function RevokeButton({ inviteId, email }: { inviteId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      try {
        const result = await revokeInviteAction(inviteId);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Invite for ${email} cancelled.`);
        setOpen(false);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-zinc-500 hover:text-red-600"
            aria-label={`Cancel the invite for ${email}`}
            title="Cancel invite"
          />
        }
      >
        <BanIcon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this invite?</AlertDialogTitle>
          <AlertDialogDescription>
            The link we emailed to {email} stops working straight away. You can invite them again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep invite</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={revoke} disabled={pending}>
            {pending ? "Cancelling…" : "Cancel invite"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
