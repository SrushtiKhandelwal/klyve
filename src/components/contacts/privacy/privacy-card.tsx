"use client";

import { useId, useState, useTransition } from "react";
import { DownloadIcon, Loader2Icon, ShieldAlertIcon, UserXIcon } from "lucide-react";
import { toast } from "sonner";
import { eraseContactAction } from "@/app/actions/gdpr";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The "Privacy" card on a contact page: download everything we store about
 * the person (GDPR access request) or erase them (GDPR "forget me").
 * Owners and admins only; members see a short note instead.
 */
export function PrivacyCard({ contactId, email, canManage }: { contactId: string; email: string; canManage: boolean }) {
  if (!canManage) {
    return (
      <p className="p-5 text-sm text-zinc-500">
        Only owners and admins can download or erase a contact&apos;s data.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-zinc-500">
          If this person asks what you store about them, send them this file: their profile, lists, emails, opens,
          clicks and consent history.
        </p>
        {/* A plain link: the browser downloads the file (the server says "attachment"). */}
        <a
          href={`/api/contacts/${encodeURIComponent(contactId)}/export`}
          download
          className={buttonVariants({ variant: "outline", className: "w-fit" })}
        >
          <DownloadIcon aria-hidden />
          Download data
        </a>
      </div>
      <div className="flex flex-col gap-2 border-t pt-4">
        <p className="text-sm text-zinc-500">
          If they ask to be forgotten, erase them. This can&apos;t be undone.
        </p>
        <EraseContactDialog contactId={contactId} email={email} />
      </div>
    </div>
  );
}

function EraseContactDialog({ contactId, email }: { contactId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  // On by default: without it, the person could be re-imported and emailed by mistake.
  const [keepSuppressed, setKeepSuppressed] = useState(true);
  const [pending, startTransition] = useTransition();
  const inputId = useId();
  const checkboxId = useId();

  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  function erase() {
    if (!matches) return;
    startTransition(async () => {
      try {
        // On success this never returns: the action redirects to /contacts.
        const result = await eraseContactAction({ contactId, confirmEmail: typed, keepSuppressed });
        if (result && !result.ok) toast.error(result.error);
        else toast.success("Contact erased. Their personal data has been removed.");
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <AlertDialogTrigger render={<Button variant="destructive" className="w-fit" />}>
        <UserXIcon aria-hidden />
        Erase this contact
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-red-50 text-red-600">
            <ShieldAlertIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Erase this contact for good?</AlertDialogTitle>
          <AlertDialogDescription>
            Use this when the person asks you to delete their data (GDPR &ldquo;right to be forgotten&rdquo;). It
            can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-3 text-sm text-zinc-600">
          <div>
            <p className="font-medium text-zinc-900">Removed</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>Their name, email address, custom fields and list memberships.</li>
              <li>Their address on every campaign email they were sent.</li>
              <li>Device and network details of their opens and clicks.</li>
              <li>Their address in the consent record (only a scrambled code is kept).</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-zinc-900">Kept, without anything that identifies them</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>Campaign numbers (sent, opened, clicked), so your reports stay correct.</li>
              <li>The consent history and a note that the erasure happened, as proof you handled the request.</li>
            </ul>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border bg-zinc-50 p-3">
            <Checkbox
              id={checkboxId}
              checked={keepSuppressed}
              onCheckedChange={(checked) => setKeepSuppressed(checked === true)}
              disabled={pending}
              className="mt-0.5"
            />
            <Label htmlFor={checkboxId} className="grid gap-0.5 text-sm leading-snug font-normal">
              <span className="font-medium text-zinc-900">Block this address from being added again (recommended)</span>
              <span className="text-zinc-500">
                Keeps a scrambled code of the address on your suppression list, not the address itself. If the same
                address is imported later, it&apos;s skipped, so you never email someone who asked to be forgotten.
              </span>
            </Label>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={inputId}>
              Type <span className="font-semibold break-all text-zinc-900">{email}</span> to confirm
            </Label>
            <Input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  erase();
                }
              }}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending || !matches} onClick={erase}>
            {pending && <Loader2Icon className="animate-spin" aria-hidden />}
            Erase contact
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
