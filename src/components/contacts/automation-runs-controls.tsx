"use client";

import { useState, useTransition } from "react";
import { Loader2, LogOut, Plus } from "lucide-react";
import { toast } from "sonner";
import { addContactToAutomation, removeContactFromAutomation, type AutomationCardResult } from "@/app/actions/automation-stats";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// The interactive bits of the contact page's "Automations" card. The card
// itself is rendered on the server (automation-runs-card.tsx); the actions
// call refresh(), so the list updates by itself after a change.

/** Runs a Server Action and shows its message as a toast. */
async function runAction(action: () => Promise<AutomationCardResult>): Promise<boolean> {
  try {
    const result = await action();
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
    return result.ok;
  } catch {
    toast.error("Couldn't reach the server. Please try again.");
    return false;
  }
}

/** "Add to automation": a picker of active, added-by-hand automations. */
export function AddToAutomation({ contactId, automations }: { contactId: string; automations: { id: string; name: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<string | null>(null);
  const items = automations.map((a) => ({ value: a.id, label: a.name }));
  // Forget a pick that's no longer offered (e.g. they were just added to it).
  const automationId = items.some((i) => i.value === picked) ? picked : null;

  if (items.length === 0) return null;

  return (
    <div className="flex gap-2">
      <Select items={items} value={automationId} onValueChange={(v) => setPicked(v)}>
        <SelectTrigger aria-label="Choose an automation" className="min-w-0 flex-1">
          <SelectValue placeholder="Choose an automation" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        disabled={!automationId || pending}
        onClick={() => {
          if (!automationId) return;
          startTransition(async () => {
            if (await runAction(() => addContactToAutomation({ contactId, automationId }))) setPicked(null);
          });
        }}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        Add
      </Button>
    </div>
  );
}

/** "Remove": takes the person out of a run that's still going, after a confirmation. */
export function RemoveFromAutomationButton({ runId, automationName }: { runId: string; automationName: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => setOpen(true)}>
        <LogOut aria-hidden />
        Remove
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from “{automationName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              They won&apos;t get any more emails or steps from this automation. Emails already sent stay sent. You can add them
              again later if the automation allows it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  // Close either way: on failure the toast explains (e.g. they'd already left).
                  await runAction(() => removeContactFromAutomation({ runId }));
                  setOpen(false);
                })
              }
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Yes, remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
