"use client";

import { useState, useTransition, type FormEvent } from "react";
import { BanIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { renameApiKeyAction, revokeApiKeyAction } from "@/app/actions/api-keys";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Rename and Revoke buttons on one API key row (owners and admins only).

type KeyRef = { id: string; name: string; prefix: string; revoked: boolean };

export function KeyActions({ apiKey }: { apiKey: KeyRef }) {
  return (
    <div className="flex items-center gap-1">
      <RenameKeyDialog apiKey={apiKey} />
      {!apiKey.revoked && <RevokeKeyDialog apiKey={apiKey} />}
    </div>
  );
}

function RenameKeyDialog({ apiKey }: { apiKey: KeyRef }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(apiKey.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await renameApiKeyAction(apiKey.id, name);
        if (!result.ok) return setError(result.error);
        toast.success("Key renamed.");
        setOpen(false);
      } catch {
        setError("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        // Start from the saved name each time.
        if (next) {
          setName(apiKey.name);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Rename ${apiKey.name}`} title="Rename" />}>
        <PencilIcon />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename key</DialogTitle>
          <DialogDescription>
            Only the label changes. The key itself (<code className="font-mono">{apiKey.prefix}…</code>) keeps working as
            before.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`rename-key-${apiKey.id}`}>Key name</Label>
            <Input
              id={`rename-key-${apiKey.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="off"
              disabled={pending}
              aria-invalid={error ? true : undefined}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevokeKeyDialog({ apiKey }: { apiKey: KeyRef }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      try {
        const result = await revokeApiKeyAction(apiKey.id);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`"${apiKey.name}" revoked.`);
        setOpen(false);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-zinc-500 hover:text-red-600"
            aria-label={`Revoke ${apiKey.name}`}
            title="Revoke"
          />
        }
      >
        <BanIcon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke &quot;{apiKey.name}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            Any app using this key (<code className="font-mono">{apiKey.prefix}…</code>) stops working immediately: its
            requests get a &quot;401 unauthorized&quot; error. This can&apos;t be undone. Emails already sent stay in your
            logs.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={revoke} disabled={pending}>
            {pending ? "Revoking…" : "Revoke key"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
