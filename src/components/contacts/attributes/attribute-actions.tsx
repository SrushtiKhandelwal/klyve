"use client";

import { useState, useTransition } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteAttribute, renameAttribute } from "@/app/actions/attributes";
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

type Props = {
  attribute: { id: string; key: string; label: string };
  contactCount: number;
  segmentCount: number;
};

/** Rename + delete buttons for one custom field. */
export function AttributeActions({ attribute, contactCount, segmentCount }: Props) {
  return (
    <div className="flex items-center gap-1">
      <RenameAttributeDialog attribute={attribute} />
      <DeleteAttributeDialog attribute={attribute} contactCount={contactCount} segmentCount={segmentCount} />
    </div>
  );
}

function RenameAttributeDialog({ attribute }: { attribute: Props["attribute"] }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(attribute.label);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await renameAttribute(attribute.id, label);
      if (result.ok) {
        toast.success("Field renamed.");
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Start fresh each time the dialog opens.
        if (next) {
          setLabel(attribute.label);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Rename ${attribute.label}`} title="Rename" />}
      >
        <PencilIcon />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename field</DialogTitle>
          <DialogDescription>
            Only the name shown in the app changes. The key{" "}
            <code className="rounded bg-zinc-100 px-1 font-mono">{attribute.key}</code> and the type stay the
            same, so your email templates and segments keep working.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`rename-${attribute.id}`}>Name</Label>
            <Input
              id={`rename-${attribute.id}`}
              value={label}
              maxLength={60}
              autoComplete="off"
              required
              aria-invalid={error ? true : undefined}
              onChange={(e) => setLabel(e.target.value)}
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !label.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAttributeDialog({ attribute, contactCount, segmentCount }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteAttribute(attribute.id);
      if (result.ok) {
        toast.success(`Field “${attribute.label}” deleted.`);
        setOpen(false);
      } else {
        toast.error(result.error);
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
            aria-label={`Delete ${attribute.label}`}
            title="Delete"
          />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{attribute.label}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {contactCount > 0
              ? `Its value will be removed from ${contactCount.toLocaleString()} ${contactCount === 1 ? "contact" : "contacts"}. `
              : "No contacts have a value for it yet. "}
            {segmentCount > 0 &&
              `${segmentCount} ${segmentCount === 1 ? "segment uses" : "segments use"} this field and will need to be fixed. `}
            Emails using {`{{ contact.${attribute.key} }}`} will show nothing. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={pending}>
            {pending ? "Deleting…" : "Delete field"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
