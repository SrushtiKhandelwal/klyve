"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";
import { MIN_PASSWORD_LENGTH, friendlyAuthError } from "@/components/auth/auth-errors";
import { InvalidResetLink } from "@/components/auth/invalid-reset-link";

type FieldErrors = { password?: string; confirmPassword?: string };

export function ResetPasswordForm({ token }: { token: string }) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // True once the server says the token is wrong, expired or already used.
  const [tokenRejected, setTokenRejected] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");

    const errors: FieldErrors = {};
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Your password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (!confirmPassword) errors.confirmPassword = "Please type your password again.";
    else if (confirmPassword !== password) errors.confirmPassword = "The passwords don't match.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    // Saves the new password, uses up the token and logs the account out
    // everywhere (revokeSessionsOnPasswordReset in src/lib/auth.ts).
    const { error } = await authClient.resetPassword({ newPassword: password, token });

    if (error) {
      setLoading(false);
      if (error.code === "INVALID_TOKEN" || error.code === "USER_NOT_FOUND") {
        setTokenRejected(true);
      } else {
        setFormError(friendlyAuthError(error));
      }
      return;
    }

    // Full page load to /login, which shows a "password changed" notice.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional: sessions were revoked, so load a clean page
    window.location.assign("/login?reset=1");
  }

  if (tokenRejected) return <InvalidResetLink />;

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </div>
      )}

      <FormField
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        error={fieldErrors.password}
        disabled={loading}
      />
      <FormField
        id="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={fieldErrors.confirmPassword}
        disabled={loading}
      />

      <Button
        type="submit"
        disabled={loading}
        className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700"
      >
        {loading && <Loader2Icon className="animate-spin" aria-hidden="true" />}
        {loading ? "Saving..." : "Set new password"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-emerald-700 hover:underline">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
