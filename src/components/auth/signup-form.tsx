"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";
import {
  MIN_PASSWORD_LENGTH,
  friendlyAuthError,
  looksLikeEmail,
} from "@/components/auth/auth-errors";

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

export function SignupForm() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // True when the email is already registered, so we can offer a login link.
  const [emailTaken, setEmailTaken] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); // stop the browser's default full-page form post
    setFormError(null);
    setEmailTaken(false);

    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");

    // 1. Check the inputs in the browser first for instant feedback.
    //    The server checks again, because browser checks can be bypassed.
    const errors: FieldErrors = {};
    if (!name) errors.name = "Please enter your name.";
    if (!email) errors.email = "Please enter your email.";
    else if (!looksLikeEmail(email)) errors.email = "Please enter a valid email address.";
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Your password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (!confirmPassword) errors.confirmPassword = "Please type your password again.";
    else if (confirmPassword !== password) errors.confirmPassword = "The passwords don't match.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // 2. Create the account. Better Auth also logs the new user in
    //    automatically (it sets the session cookie).
    setLoading(true);
    const { error } = await signUp.email({ name, email, password });

    if (error) {
      setFormError(friendlyAuthError(error));
      setEmailTaken(error.code?.startsWith("USER_ALREADY_EXISTS") ?? false);
      setLoading(false);
      return;
    }

    // 3. Go to the dashboard (it sends new users on to /onboarding) with a
    //    FULL page load, so no page cached from before sign-up is reused.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional: auth change needs a clean page load
    window.location.assign("/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {formError}{" "}
          {/* Small shortcut when the email is already registered. */}
          {emailTaken && (
            <Link href="/login" className="font-medium underline">
              Log in
            </Link>
          )}
        </div>
      )}

      <FormField
        id="name"
        label="Full name"
        type="text"
        autoComplete="name"
        placeholder="Jane Doe"
        error={fieldErrors.name}
        disabled={loading}
      />
      <FormField
        id="email"
        label="Work email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={fieldErrors.email}
        disabled={loading}
      />
      <FormField
        id="password"
        label="Password"
        type="password"
        // "new-password" tells password managers to suggest a strong password.
        autoComplete="new-password"
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        error={fieldErrors.password}
        disabled={loading}
      />
      <FormField
        id="confirmPassword"
        label="Confirm password"
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
        {loading ? "Creating your account..." : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-emerald-700 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
