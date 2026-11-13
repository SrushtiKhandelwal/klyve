"use client";

import { useState, useTransition } from "react";
import { Loader2, Lock, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { removeSuppressionEntry } from "@/app/actions/suppression";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SuppressionTableRow } from "./suppression-table";

/** Extra warning per reason: why removing this one is risky. */
function riskText(row: SuppressionTableRow): string {
  switch (row.reason) {
    case "COMPLAINT":
      return "This person marked one of your emails as spam. Emailing them again can get your sending account suspended. Only remove it if they've clearly asked to hear from you again.";
    case "HARD_BOUNCE":
      return "This address bounced: the mail server said it doesn't exist. Sending to it again hurts your sender reputation unless it has really been fixed.";
    case "UNSUBSCRIBE":
    case "IMPORT":
      return "This person asked not to be emailed. Only remove it if they've given you permission again.";
    default:
      return "Only remove it if you're sure you have permission to email this address.";
  }
}

/** Trash icon + confirmation. ERASURE rows show a lock instead (they can't be removed). */
export function RemoveSuppressionButton({ row }: { row: SuppressionTableRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (row.reason === "ERASURE") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={<span tabIndex={0} className="inline-flex size-8 items-center justify-center text-zinc-400" />}
          aria-label="Can't be removed"
        >
          <Lock className="size-4" aria-hidden />
        </TooltipTrigger>
        <TooltipContent>The person asked to be forgotten, so this entry can&apos;t be removed.</TooltipContent>
      </Tooltip>
    );
  }

  const label = row.email ?? "this address";

  function handleRemove() {
    startTransition(async () => {
      try {
        const result = await removeSuppressionEntry(row.id);
        if (result.ok) {
          toast.success(result.message, { description: label });
          setOpen(false);
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-sm" className="text-zinc-500 hover:text-red-600" />}
        aria-label={`Remove ${label} from the suppression list`}
      >
        <Trash2 aria-hidden />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove from the suppression list?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium break-all text-zinc-900">{label}</span> could then be emailed again
            by your campaigns (if they&apos;re a subscribed contact).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{riskText(row)}</span>
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={handleRemove}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Remove
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
