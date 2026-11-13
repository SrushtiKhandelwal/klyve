"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/auth/form-field";
import { MIN_PASSWORD_LENGTH, friendlyAuthError } from "@/components/auth/auth-errors";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

// Change password: type the current one (so someone at an unlocked computer
// can't take over the account), then the new one twice. Every OTHER device
// is logged out afterwards; this one stays logged in.

type FieldErrors = { current?: string; next?: string; confirm?: string };

export function PasswordForm() {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const current = String(data.get("currentPassword") ?? "");
    const next = String(data.get("newPassword") ?? "");
    const confirm = String(data.get("confirmNewPassword") ?? "");

    const errors: FieldErrors = {};
    if (!current) errors.current = "Please enter your current password.";
    if (next.length < MIN_PASSWORD_LENGTH) errors.next = `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    else if (next === current) errors.next = "Your new password must be different from the current one.";
    if (!confirm) errors.confirm = "Please type your new password again.";
    else if (confirm !== next) errors.confirm = "The new passwords don't match.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    startTransition(async () => {
      const { error: authError } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        // Log out every other device: if someone else knew the old password, they're out.
        revokeOtherSessions: true,
      });
      if (authError) {
        if (authError.code === "INVALID_PASSWORD") setFieldErrors({ current: "That isn't your current password." });
        else setError(friendlyAuthError(authError));
        return;
      }
      form.reset();
      toast.success("Password changed. Your other devices were logged out.");
      // The "Where you're logged in" list (Security) changes too.
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:max-w-sm">
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <FormField
        id="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={fieldErrors.current}
        disabled={pending}
      />
      <FormField
        id="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        error={fieldErrors.next}
        disabled={pending}
      />
      <FormField
        id="confirmNewPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={fieldErrors.confirm}
        disabled={pending}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Changing…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
