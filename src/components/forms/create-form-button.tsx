"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { createFormAction } from "@/app/actions/forms";
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

/**
 * "Create form": asks for a name (pre-filled, so it's one click), creates a
 * ready-to-use form in the brand's colours and opens the builder.
 */
export function CreateFormButton({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    setError(null);
    startTransition(async () => {
      try {
        const result = await createFormAction({ name });
        if (!result.ok) return setError(result.error);
        router.push(`/forms/${result.formId}`);
      } catch {
        setError("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Create form
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setError(null);
          setOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a sign-up form</DialogTitle>
            <DialogDescription>
              We&apos;ll start you off with an email field and a first-name field in your brand colours. You can change
              everything next.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-form-name">Form name</Label>
              <Input
                id="new-form-name"
                name="name"
                defaultValue="Newsletter sign-up"
                maxLength={100}
                autoFocus
                required
                disabled={pending}
                aria-invalid={error ? true : undefined}
                aria-describedby="new-form-name-hint"
              />
              <p id="new-form-name-hint" className={error ? "text-sm text-destructive" : "text-xs text-zinc-500"}>
                {error ?? "Only you and your team see this, e.g. “Website footer” or “Instagram bio”."}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                Create form
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
