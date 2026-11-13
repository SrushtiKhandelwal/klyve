"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2Icon, MailCheckIcon } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";
import { friendlyAuthError, looksLikeEmail } from "@/components/auth/auth-errors";

export function ForgotPasswordForm() {
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // The address we just sent to, so the confirmation can mention it.
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!email) return setEmailError("Please enter your email.");
    if (!looksLikeEmail(email)) return setEmailError("Please enter a valid email address.");
    setEmailError(undefined);

    setLoading(true);
    // The server answers the same way whether or not the account exists, and
    // only emails real accounts. After the token is checked, the email link
    // opens our /reset-password page.
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setLoading(false);

    if (error) {
      // Only things like "too many attempts" or a network problem end up
      // here, never "no such account".
      setFormError(friendlyAuthError(error));
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="grid gap-5 text-center">
        <Glyph icon={MailCheckIcon} size="xl" strokeWidth={1.5} className="mx-auto" />
        {/* Deliberately the same message for every email address, so this
            page can't be used to find out who has an account. */}
        <p role="status" className="text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground break-all">{sentTo}</span>,
          we sent a link to reset your password. It expires in 1 hour. Check your spam folder if you
          don&apos;t see it.
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full"
          onClick={() => setSentTo(null)}
        >
          Use a different email
        </Button>
        <BackToLogin />
      </div>
    );
  }

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
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={emailError}
        disabled={loading}
      />

      <Button
        type="submit"
        disabled={loading}
        className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700"
      >
        {loading && <Loader2Icon className="animate-spin" aria-hidden="true" />}
        {loading ? "Sending..." : "Send reset link"}
      </Button>

      <BackToLogin />
    </form>
  );
}

function BackToLogin() {
  return (
    <p className="text-center text-sm text-muted-foreground">
      Remembered it?{" "}
      <Link href="/login" className="font-medium text-emerald-700 hover:underline">
        Back to log in
      </Link>
    </p>
  );
}
