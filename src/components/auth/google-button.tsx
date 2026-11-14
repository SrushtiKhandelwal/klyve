"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { friendlyAuthError } from "@/components/auth/auth-errors";
import { safeNextPath, withNext } from "@/components/auth/safe-next";

// "Continue with Google" on /login and /signup.
//
// Clicking it asks our server for a Google sign-in link and goes there. Google
// sends the person back to /api/auth/callback/google, which logs them in (or
// makes their account the first time) and then forwards them to:
//   - the "?next=" page (e.g. a team invite) or /dashboard, when it worked
//     (/dashboard sends brand-new users on to /onboarding);
//   - /login?error=<code>, when it didn't (<GoogleErrorNotice> explains it).

export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
    const { error: authError } = await signIn.social({
      provider: "google",
      callbackURL: next ?? "/dashboard",
      // Keep "?next=" on the way back, so a failed try can be repeated.
      errorCallbackURL: withNext("/login", next),
    });
    // On success the browser is already on its way to Google: keep the spinner.
    if (authError) {
      setError(friendlyAuthError(authError));
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={loading}
        className="h-10 w-full gap-2.5 border-zinc-300 bg-white font-medium text-zinc-800 hover:bg-zinc-50"
      >
        {loading ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <GoogleLogo />}
        {loading ? "Opening Google..." : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** The thin "or" line between the Google button and the email form. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500" role="separator">
      <span className="h-px flex-1 bg-zinc-200" />
      or
      <span className="h-px flex-1 bg-zinc-200" />
    </div>
  );
}

// What went wrong, in plain words. The codes come from Better Auth's
// "/login?error=..." redirect after Google sends the person back.
const GOOGLE_ERRORS: Record<string, string> = {
  account_not_linked:
    "This email already has a Klyve account with a password. Log in with your password below. Once your email address is verified, Google works for it too.",
  access_denied: "Google sign-in was cancelled. You can try again, or log in with your email.",
  email_not_found: "Google didn't share an email address, so we couldn't log you in.",
  account_already_linked_to_different_user: "This Google account is already used by a different Klyve account.",
  signup_disabled: "New accounts can't be created right now.",
};

/** Explains a failed Google sign-in on /login. Reads the URL, so render it inside <Suspense>. */
export function GoogleErrorNotice() {
  const code = useSearchParams().get("error");
  if (!code) return null;
  const message =
    GOOGLE_ERRORS[code.toLowerCase()] ?? "Google sign-in didn't work this time. Please try again, or log in with your email.";

  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </div>
  );
}

/** Google's "G" mark (its official colours, as Google's sign-in guidelines ask). */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
