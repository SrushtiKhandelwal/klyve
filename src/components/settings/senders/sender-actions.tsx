"use client";

import { useState, useTransition } from "react";
import { KeyRoundIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { editSender, removeSender } from "@/app/actions/senders";
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
import type { SenderFieldErrors } from "@/lib/email/senders";
import { ProviderSelect } from "./provider-select";
import type { ProviderOption, SenderView } from "./types";
import { ResendCodeButton, VerifyCodeForm } from "./verify-code-form";

/** The buttons on one sender row. Members only see the verification buttons. */
export function SenderActions({
  sender,
  providers,
  canManage,
}: {
  sender: SenderView;
  providers: ProviderOption[];
  canManage: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {!sender.verified && (
        <>
          <EnterCodeDialog sender={sender} />
          <ResendCodeButton senderId={sender.id} sentAt={sender.verificationSentAt} />
        </>
      )}
      {canManage && (
        <>
          <EditSenderDialog sender={sender} providers={providers} />
          <DeleteSenderDialog sender={sender} />
        </>
      )}
    </div>
  );
}

function EnterCodeDialog({ sender }: { sender: SenderView }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <KeyRoundIcon />
        Enter code
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verify {sender.email}</DialogTitle>
          <DialogDescription>
            {sender.codeActive
              ? "Enter the 6-digit code we emailed to this address."
              : "The last code has expired or was used up. Send a new code, then enter it here."}
          </DialogDescription>
        </DialogHeader>
        {/* Re-mount on each open so the form starts empty. */}
        {open && (
          <VerifyCodeForm
            senderId={sender.id}
            email={sender.email}
            sentAt={sender.verificationSentAt}
            onVerified={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditSenderDialog({ sender, providers }: { sender: SenderView; providers: ProviderOption[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(sender.name);
  const [replyTo, setReplyTo] = useState(sender.replyTo ?? "");
  const [providerId, setProviderId] = useState(sender.provider?.id ?? "");
  const [errors, setErrors] = useState<SenderFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await editSender(sender.id, { name, replyTo, providerId });
      if (result.ok) {
        toast.success("Sender updated.");
        setOpen(false);
      } else {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error ?? null);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Start from the saved values each time the dialog opens.
        if (next) {
          setName(sender.name);
          setReplyTo(sender.replyTo ?? "");
          setProviderId(sender.provider?.id ?? "");
          setErrors({});
          setMessage(null);
        }
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${sender.email}`} title="Edit" />}
      >
        <PencilIcon />
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit sender</DialogTitle>
          <DialogDescription>
            The address <span className="font-medium text-zinc-700">{sender.email}</span> can&apos;t be changed,
            because it&apos;s the one that was verified. To use another address, add a new sender.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`edit-name-${sender.id}`}>Display name</Label>
            <Input
              id={`edit-name-${sender.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={70}
              autoComplete="off"
              required
              aria-invalid={errors.name ? true : undefined}
            />
            {errors.name && <p className="text-xs text-red-600">{errors.name[0]}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`edit-reply-${sender.id}`}>
              Reply-to <span className="font-normal text-zinc-400">(optional)</span>
            </Label>
            <Input
              id={`edit-reply-${sender.id}`}
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder={sender.email}
              maxLength={254}
              autoComplete="off"
              aria-invalid={errors.replyTo ? true : undefined}
            />
            {errors.replyTo && <p className="text-xs text-red-600">{errors.replyTo[0]}</p>}
          </div>
          {providers.length > 0 ? (
            <ProviderSelect
              id={`edit-provider-${sender.id}`}
              providers={providers}
              value={providerId}
              onChange={setProviderId}
              error={errors.providerId?.[0]}
            />
          ) : (
            <p className="text-xs text-amber-700">Add a sending provider first, then choose it here.</p>
          )}
          {message && <p className="text-sm text-red-600">{message}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim() || !providerId}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSenderDialog({ sender }: { sender: SenderView }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await removeSender(sender.id);
      if (result.ok) {
        toast.success(`Sender ${sender.email} deleted.`);
        setOpen(false);
      } else {
        toast.error(result.error ?? "Could not delete the sender.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-zinc-500 hover:text-red-600"
            aria-label={`Delete ${sender.email}`}
            title="Delete"
          />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {sender.email}?</AlertDialogTitle>
          <AlertDialogDescription>
            You won&apos;t be able to send campaigns from this address any more. To use it again you&apos;ll need to add
            it and verify it again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={pending}>
            {pending ? "Deleting…" : "Delete sender"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
