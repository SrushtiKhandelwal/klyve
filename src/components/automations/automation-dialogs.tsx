"use client";

import { useTransition } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAutomationAction } from "@/app/actions/automations";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** "Delete this automation?" confirmation, used on the list and in the builder. */
export function DeleteAutomationDialog({
  automationId,
  name,
  open,
  onOpenChange,
  onDeleted,
}: {
  automationId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await deleteAutomationAction(automationId);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Automation deleted.");
        onOpenChange(false);
        onDeleted?.();
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It stops right away: nobody new enters, and people in the middle of it won&apos;t get the remaining emails.
            Its history and reports are deleted too. This can&apos;t be undone. To stop it for a while, pause it instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={handleDelete}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Delete automation
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Shown when "Activate" was refused: the exact things to fix, as a list. */
export function ActivationProblemsDialog({
  problems,
  onOpenChange,
}: {
  /** null = closed. */
  problems: string[] | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={problems !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Almost ready: fix these first</DialogTitle>
          <DialogDescription>The automation stays off until everything below is sorted.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {(problems ?? []).map((p) => (
            <li key={p} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-600/15">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
