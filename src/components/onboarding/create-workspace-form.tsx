"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { createWorkspace } from "@/app/actions/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateWorkspaceForm() {
  // useActionState gives us: the last result from the server (errors),
  // the function to put on the <form>, and whether it's still running.
  const [state, formAction, pending] = useActionState(
    createWorkspace,
    undefined,
  );
  const nameErrors = state?.errors?.name;
  const succeeded = state?.success === true;

  // Workspace created: do a full page load so the dashboard is fetched fresh
  // from the server (see the note in createWorkspace for why).
  useEffect(() => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional: see comment above
    if (succeeded) window.location.assign("/dashboard");
  }, [succeeded]);
  const busy = pending || succeeded;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          id="workspace-name"
          name="name"
          placeholder="e.g. Acme Marketing"
          autoComplete="organization"
          autoFocus
          maxLength={50}
          defaultValue={state?.values?.name}
          readOnly={busy}
          aria-invalid={nameErrors ? true : undefined}
          aria-describedby={nameErrors ? "workspace-name-error" : undefined}
        />
        {nameErrors ? (
          <p id="workspace-name-error" className="text-sm text-destructive">
            {nameErrors[0]}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Usually your company or team name. You can change it later.
          </p>
        )}
      </div>

      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      <Button type="submit" size="lg" disabled={busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        {succeeded
          ? "Opening your dashboard…"
          : pending
            ? "Creating workspace…"
            : "Create workspace"}
      </Button>
    </form>
  );
}
