"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { deleteAccountAction } from "@/app/actions/account";
import { FormField } from "@/components/auth/form-field";
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
import type { DeletionPlan } from "@/lib/account-deletion";

// Settings → Profile → "Delete account": a red button that opens a dialog
// saying exactly what will be deleted, then asks for the password (or, for
// Google-only accounts, a recent login) and the word DELETE.
// The real checks happen on the server (src/app/actions/account.ts).

type FieldErrors = { password?: string; confirm?: string };

export function DeleteAccount({ plan, hasPassword }: { plan: DeletionPlan; hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const blocked = plan.blockers.length > 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm") ?? "");

    const errors: FieldErrors = {};
    if (hasPassword && !password) errors.password = "Please enter your password.";
    if (confirm.trim().toUpperCase() !== "DELETE") errors.confirm = "Type DELETE to confirm.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    startTransition(async () => {
      const result = await deleteAccountAction({ password, confirm });
      if (!result.ok) {
        if (result.field) setFieldErrors({ [result.field]: result.error });
        else setError(result.error);
        return;
      }
      // Logged out and gone: a FULL page load on purpose, so nothing cached
      // from the logged-in app can show again (same as logging out).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login?deleted=1");
    });
  }

  return (
    <div className="grid gap-4 sm:flex sm:items-center sm:justify-between">
      <p className="max-w-xl text-sm text-zinc-600">
        Permanently delete your account and the workspaces only you use. This can&apos;t be undone.
      </p>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          setError(null);
          setFieldErrors({});
        }}
      >
        <DialogTrigger render={<Button variant="outline" className="shrink-0 text-red-600 hover:text-red-700" />}>
          Delete account
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>This is permanent. We can&apos;t bring anything back afterwards.</DialogDescription>
          </DialogHeader>

          {blocked ? (
            <div className="grid gap-4 text-sm text-zinc-700">
              <p>Before you can delete your account:</p>
              <ul className="grid gap-2">
                {plan.blockers.map((b) => (
                  <li key={b.name} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <span className="font-medium text-zinc-900">{b.name}</span>: {b.reason}
                  </li>
                ))}
              </ul>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="grid gap-4">
              <WhatHappens plan={plan} />

              {hasPassword ? (
                <FormField
                  id="delete-account-password"
                  name="password"
                  label="Your password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  error={fieldErrors.password}
                  disabled={pending}
                />
              ) : (
                <p className="text-sm text-zinc-600">
                  You log in with Google, so to prove it&apos;s you, you need to have logged in within the last 15
                  minutes.
                </p>
              )}
              <FormField
                id="delete-account-confirm"
                name="confirm"
                label="Type DELETE to confirm"
                type="text"
                autoComplete="off"
                autoFocus={!hasPassword}
                error={fieldErrors.confirm}
                disabled={pending}
              />

              {error && (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" aria-hidden />}
                  {pending ? "Deleting..." : "Delete my account"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WhatHappens({ plan }: { plan: DeletionPlan }) {
  const names = (list: { name: string }[]) => list.map((w) => w.name).join(", ");
  return (
    <ul className="grid list-disc gap-2 pl-5 text-sm leading-6 text-zinc-700 marker:text-zinc-400">
      {plan.deleteWorkspaces.length > 0 && (
        <li>
          <span className="font-medium text-zinc-900">Deleted with everything in them</span> (contacts, lists,
          campaigns, templates, automations, forms, images and sending settings):{" "}
          <span className="font-medium text-zinc-900">{names(plan.deleteWorkspaces)}</span>.
        </li>
      )}
      {plan.leaveWorkspaces.length > 0 && (
        <li>
          You&apos;re removed from <span className="font-medium text-zinc-900">{names(plan.leaveWorkspaces)}</span>.
          These workspaces and their data stay for the other people in them.
        </li>
      )}
      <li>Your login is deleted and you&apos;re logged out on every device.</li>
      <li>
        Emails you already sent stay in people&apos;s inboxes, but images in them stop loading. Copies in our nightly
        backups are gone within 14 days.
      </li>
    </ul>
  );
}
