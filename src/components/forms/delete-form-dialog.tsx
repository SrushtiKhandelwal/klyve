"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { deleteFormAction } from "@/app/actions/forms";
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

/** "Delete this form?" confirmation, used on the forms list and in the builder. */
export function DeleteFormDialog({
  formId,
  name,
  open,
  onOpenChange,
  onDeleted,
}: {
  formId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await deleteFormAction(formId);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Form deleted.");
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
            The form&apos;s link and any embeds stop working right away. People who already signed up stay in your
            contacts. This can&apos;t be undone. To stop sign-ups for a while, pause the form instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={handleDelete}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Delete form
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
