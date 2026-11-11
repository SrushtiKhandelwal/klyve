"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteSegment } from "@/app/actions/segments";
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

/**
 * Delete button + "are you sure?" dialog for a saved segment.
 * `compact` shows just a bin icon (for the list); otherwise a labelled button.
 * `redirectTo` is where to go afterwards (e.g. back to the list).
 */
export function DeleteSegmentDialog({
  segment,
  compact = false,
  redirectTo,
}: {
  segment: { id: string; name: string };
  compact?: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteSegment(segment.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Segment “${segment.name}” deleted.`);
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          compact ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-zinc-500 hover:text-red-600"
              aria-label={`Delete ${segment.name}`}
              title="Delete"
            />
          ) : (
            <Button variant="outline" className="text-red-600 hover:text-red-700" />
          )
        }
      >
        <Trash2Icon />
        {!compact && "Delete"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{segment.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Only the saved filter is deleted. Your contacts stay exactly as they are.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={pending}>
            {pending ? "Deleting…" : "Delete segment"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
