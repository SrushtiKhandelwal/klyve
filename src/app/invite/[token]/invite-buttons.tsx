"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { acceptInviteAction } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";

/** "Join <workspace>": accepts the invite, then opens the dashboard of that workspace. */
export function AcceptInviteButton({ token, label }: { token: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function accept() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await acceptInviteAction(token);
        if (!result.ok) return setError(result.error);
        setDone(true);
        // Full page load so the dashboard is fetched fresh, in the new workspace.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional: a membership change needs a clean page load
        window.location.assign("/dashboard");
      } catch {
        setError("Couldn't reach the server. Please try again.");
      }
    });
  }

  const busy = pending || done;
  return (
    <div className="grid gap-3">
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button onClick={accept} disabled={busy} className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700">
        {busy && <Loader2Icon className="animate-spin" aria-hidden />}
        {done ? "Opening your workspace…" : pending ? "Joining…" : label}
      </Button>
    </div>
  );
}

/** Logged in as the wrong person: log out, then log in again and come back here. */
export function SwitchAccountButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);

  async function switchAccount() {
    setPending(true);
    await signOut();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional: auth change needs a clean page load
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <Button variant="outline" onClick={switchAccount} disabled={pending} className="h-10 w-full">
      {pending && <Loader2Icon className="animate-spin" aria-hidden />}
      Log out and switch account
    </Button>
  );
}
