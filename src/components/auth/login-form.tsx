"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheckIcon, Loader2Icon } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";
import { friendlyAuthError, looksLikeEmail } from "@/components/auth/auth-errors";
import { safeNextPath, withNext } from "@/components/auth/safe-next";

type FieldErrors = { email?: string; password?: string };

// Green "Password updated" notice, shown after /reset-password sends the
// user here as /login?reset=1. It reads the URL, so (Next.js rule) it must be
// rendered inside <Suspense>; the rest of the form doesn't have to wait.
function ResetSuccessNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get("reset") !== "1") return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      <CircleCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>Your password was changed. Log in with your new password.</span>
    </div>
  );
}

/** The safe "?next=" page from the address bar (read in the browser only, when needed). */
function currentNext(): string | null {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

/** "Sign up" link that keeps the "?next=" (e.g. a team invite). Reads the URL, so it sits in <Suspense>. */
function SignupLink() {
  const next = useSearchParams().get("next");
  return (
    <Link href={withNext("/signup", next)} className="font-medium text-emerald-700 hover:underline">
      Sign up
    </Link>
  );
}

export function LoginForm() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); // stop the browser's default full-page form post
    setFormError(null);

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    // 1. Check the inputs in the browser first, so obvious mistakes
    //    get an instant message without a trip to the server.
    const errors: FieldErrors = {};
    if (!email) errors.email = "Please enter your email.";
    else if (!looksLikeEmail(email)) errors.email = "Please enter a valid email address.";
    if (!password) errors.password = "Please enter your password.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // 2. Ask Better Auth to log in. On success it sets the session cookie.
    setLoading(true);
    const { data: result, error } = await signIn.email({ email, password });

    if (error) {
      setFormError(friendlyAuthError(error));
      setLoading(false);
      return;
    }

    // 2b. Two-step login is on for this account: the password was right, but
    //     no session exists yet. The auth client is already taking the user
    //     to /two-factor (see src/lib/auth-client.ts), so just wait.
    if (result && "twoFactorRedirect" in result && result.twoFactorRedirect) return;

    // 3. Go to the page they came for (e.g. a team invite) or the dashboard,
    //    with a FULL page load, so nothing cached from before login
    //    (e.g. "/dashboard → go to /login") can be reused.
    //    We leave `loading` on so the button stays disabled while we navigate.
    window.location.assign(currentNext() ?? "/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      <Suspense fallback={null}>
        <ResetSuccessNotice />
      </Suspense>

      {/* Server errors (like a wrong password) appear here and are read
          out by screen readers thanks to role="alert". */}
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
        error={fieldErrors.email}
        disabled={loading}
      />
      <FormField
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        error={fieldErrors.password}
        disabled={loading}
        labelAction={
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            Forgot password?
          </Link>
        }
      />

      <Button
        type="submit"
        disabled={loading}
        className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700"
      >
        {loading && <Loader2Icon className="animate-spin" aria-hidden="true" />}
        {loading ? "Logging in..." : "Log in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Suspense
          fallback={
            <Link href="/signup" className="font-medium text-emerald-700 hover:underline">
              Sign up
            </Link>
          }
        >
          <SignupLink />
        </Suspense>
      </p>
    </form>
  );
}
