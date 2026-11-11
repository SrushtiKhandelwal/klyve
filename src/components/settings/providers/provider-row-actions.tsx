"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck, MoreHorizontal, Pencil, PlugZap, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteProviderAction,
  setDefaultProviderAction,
  testProviderAction,
} from "@/app/actions/providers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SendTestEmailDialog, type TestEmailTarget } from "./send-test-email-dialog";

export type ProviderRowData = TestEmailTarget & {
  isDefault: boolean;
  senderCount: number;
  /** Which provider becomes the default if this (default) one is deleted. */
  nextDefaultName: string | null;
};

/**
 * The buttons on one provider card: Test connection, Send test email, and a
 * "⋯" menu with Edit / Make default / Delete (owners and admins only).
 * The server checks the role again; hiding the buttons is only for clarity.
 */
export function ProviderRowActions({
  provider,
  userEmail,
  canManage,
}: {
  provider: ProviderRowData;
  userEmail: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [testing, startTest] = useTransition();
  const [makingDefault, startMakeDefault] = useTransition();
  const [testEmailOpen, setTestEmailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function handleTest() {
    startTest(async () => {
      const result = await testProviderAction(provider.id);
      if (result.ok) toast.success(`“${provider.name}” is connected`, { description: result.detail });
      else toast.error(`Couldn't connect to “${provider.name}”`, { description: result.error });
    });
  }

  function handleMakeDefault() {
    startMakeDefault(async () => {
      const result = await setDefaultProviderAction(provider.id);
      if (result.ok) toast.success(`“${provider.name}” is now your default provider`);
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={testing}>
        {testing ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />}
        {testing ? "Testing…" : "Test connection"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setTestEmailOpen(true)}>
        <MailCheck aria-hidden />
        Send test email
      </Button>

      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${provider.name}`} />}
          >
            {makingDefault ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => router.push(`/settings/providers/${provider.id}`)}>
              <Pencil aria-hidden />
              Edit
            </DropdownMenuItem>
            {!provider.isDefault && (
              <DropdownMenuItem onClick={handleMakeDefault} disabled={makingDefault}>
                <Star aria-hidden />
                Make default
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 aria-hidden />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <SendTestEmailDialog
        provider={provider}
        userEmail={userEmail}
        open={testEmailOpen}
        onOpenChange={setTestEmailOpen}
      />
      {canManage && <DeleteProviderDialog provider={provider} open={deleteOpen} onOpenChange={setDeleteOpen} />}
    </div>
  );
}

function DeleteProviderDialog({
  provider,
  open,
  onOpenChange,
}: {
  provider: ProviderRowData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteProviderAction(provider.id);
      if (result.ok) {
        toast.success(`“${provider.name}” deleted`, { description: result.message });
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  const { senderCount } = provider;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{provider.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            MailFlow will forget these credentials. Your account with the provider itself is not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {senderCount > 0 && (
          <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <strong>
              {senderCount === 1 ? "1 sender uses" : `${senderCount.toLocaleString("en")} senders use`} this provider.
            </strong>{" "}
            {senderCount === 1 ? "It stays" : "They stay"}, but without a provider until you pick another one.
          </p>
        )}
        {provider.isDefault && provider.nextDefaultName && (
          <p className="text-sm text-zinc-600">
            “{provider.nextDefaultName}” will become your default provider.
          </p>
        )}
        {provider.isDefault && !provider.nextDefaultName && (
          <p className="text-sm text-zinc-600">This is your only provider, so you won&apos;t be able to send until you add another.</p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={pending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Deleting…" : "Delete provider"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
