"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2, Send, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { enrollPeopleAction, sendStepTestAction } from "@/app/actions/automations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Lookups } from "../describe";
import { Picker } from "./fields";
import type { SenderOption } from "./step-panel";

/** "Add people": put everyone in a list or segment through the automation now. */
export function EnrollDialog({
  automationId,
  lookups,
  cap,
  open,
  onOpenChange,
}: {
  automationId: string;
  lookups: Lookups;
  cap: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [source, setSource] = useState<"list" | "segment">("list");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const options = (source === "list" ? lookups.lists : lookups.segments).map((o) => ({ value: o.id, label: o.name }));

  function submit() {
    if (!pickedId) return setError(`Choose a ${source} first.`);
    setError(null);
    startTransition(async () => {
      try {
        const result = await enrollPeopleAction(automationId, { source, id: pickedId });
        if (!result.ok) return setError(result.error);
        const skipped = result.skipped > 0 ? ` ${result.skipped.toLocaleString("en")} skipped (already in it, or not subscribed).` : "";
        toast.success(`Added ${result.enrolled.toLocaleString("en")} ${result.enrolled === 1 ? "person" : "people"}.${skipped}`);
        onOpenChange(false);
      } catch {
        setError("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add people now</DialogTitle>
          <DialogDescription>
            Everyone subscribed in the list or segment starts at the first step right away. People already going through it
            are skipped. Up to {cap.toLocaleString("en")} people at a time.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 rounded-lg bg-zinc-100 p-1" role="group" aria-label="Add people from">
          {(["list", "segment"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={source === s}
              onClick={() => {
                setSource(s);
                setPickedId(null);
                setError(null);
              }}
              className={
                source === s
                  ? "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm"
                  : "rounded-md px-3 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
              }
            >
              {s === "list" ? "A list" : "A segment"}
            </button>
          ))}
        </div>
        <Picker
          key={source}
          label={source === "list" ? "List" : "Segment"}
          value={pickedId}
          options={options}
          onChange={setPickedId}
          empty={source === "list" ? "You don't have any lists yet." : "You don't have any segments yet."}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || !pickedId} onClick={submit}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
            Add them
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Send a test" for one email step (its last SAVED version). */
export function StepTestDialog({
  automationId,
  stepId,
  defaultSenderId,
  senders,
  defaultTo,
  beforeSend,
  onOpenChange,
}: {
  automationId: string;
  /** null = closed. */
  stepId: string | null;
  defaultSenderId: string | null;
  senders: SenderOption[];
  defaultTo: string;
  /** Saves pending builder changes first; false = couldn't. */
  beforeSend: () => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
}) {
  const [to, setTo] = useState(defaultTo);
  const [senderId, setSenderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chosenSender = senderId ?? (senders.some((s) => s.id === defaultSenderId) ? defaultSenderId : (senders[0]?.id ?? null));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stepId) return;
    setError(null);
    startTransition(async () => {
      try {
        if (!(await beforeSend())) return setError("Your latest changes aren't saved yet. Fix the problem shown at the top first.");
        const result = await sendStepTestAction(automationId, stepId, { to, senderId: chosenSender });
        if (!result.ok) return setError(result.error);
        toast.success(`Test email sent to ${result.to}.`);
        onOpenChange(false);
      } catch {
        setError("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <Dialog open={stepId !== null} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
          <DialogDescription>
            The subject starts with “[Test]” and the unsubscribe link does nothing. Personalised as the contact with that
            address, or a sample person.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Picker
            label="From"
            value={chosenSender}
            options={senders.map((s) => ({ value: s.id, label: s.label }))}
            onChange={setSenderId}
            empty="Verify a sender in Settings → Senders first."
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="automation-test-to">Send to</Label>
            <Input id="automation-test-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} maxLength={254} required />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !chosenSender}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
              Send test
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Deleting an if/else: what should happen to the steps inside it? */
export function DeleteConditionDialog({
  yesCount,
  noCount,
  open,
  onOpenChange,
  onConfirm,
}: {
  yesCount: number;
  noCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (keep: "none" | "yes" | "no") => void;
}) {
  const steps = (n: number) => `${n} step${n === 1 ? "" : "s"}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this if/else?</DialogTitle>
          <DialogDescription>
            It has {steps(yesCount)} on the “If yes” path and {steps(noCount)} on the “If no” path. What should happen to them?
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button variant="outline" className="h-auto justify-start py-2 text-left whitespace-normal" disabled={yesCount === 0} onClick={() => onConfirm("yes")}>
            Keep the “If yes” steps (everyone gets them)
          </Button>
          <Button variant="outline" className="h-auto justify-start py-2 text-left whitespace-normal" disabled={noCount === 0} onClick={() => onConfirm("no")}>
            Keep the “If no” steps (everyone gets them)
          </Button>
          <Button variant="destructive" className="h-auto justify-start py-2 text-left whitespace-normal" onClick={() => onConfirm("none")}>
            Delete it and all {steps(yesCount + noCount)} inside
          </Button>
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
