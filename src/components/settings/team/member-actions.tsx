"use client";

import { useState, useTransition } from "react";
import { LogOutIcon, UserMinusIcon } from "lucide-react";
import { toast } from "sonner";
import { changeMemberRoleAction, leaveWorkspaceAction, removeMemberAction } from "@/app/actions/team";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, isAssignableRole, type AssignableRole } from "@/lib/team/roles";

// The buttons on one row of Settings → Team → Members. Which of them show up
// is decided by the page (using the rules in src/lib/team/roles.ts); the
// Server Actions check the same rules again.

const ROLE_ITEMS = (["ADMIN", "MEMBER"] as const).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

/** Owner only: switch someone between Admin and Member. */
export function MemberRoleSelect({ memberId, name, role }: { memberId: string; name: string; role: AssignableRole }) {
  const [pending, startTransition] = useTransition();

  function change(next: unknown) {
    if (!isAssignableRole(next) || next === role) return;
    startTransition(async () => {
      try {
        const result = await changeMemberRoleAction(memberId, next);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`${name} is now ${next === "ADMIN" ? "an admin" : "a member"}.`);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <Select items={ROLE_ITEMS} value={role} onValueChange={change} disabled={pending}>
      <SelectTrigger size="sm" className="w-28 bg-white" aria-label={`Role of ${name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_ITEMS.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Remove someone from the workspace (they keep their Klyve account). */
export function RemoveMemberButton({ memberId, name, workspaceName }: { memberId: string; name: string; workspaceName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      try {
        const result = await removeMemberAction(memberId);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`${name} was removed from the workspace.`);
        setOpen(false);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-zinc-500 hover:text-red-600"
            aria-label={`Remove ${name}`}
            title="Remove from workspace"
          />
        }
      >
        <UserMinusIcon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            They lose access to &quot;{workspaceName}&quot; straight away. Their account and anything they created here
            (campaigns, templates, contacts) stay. You can invite them again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={remove} disabled={pending}>
            {pending ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** For admins and members: leave this workspace. */
export function LeaveWorkspaceButton({ workspaceName }: { workspaceName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);

  function leave() {
    startTransition(async () => {
      try {
        const result = await leaveWorkspaceAction();
        if (!result.ok) return void toast.error(result.error);
        setLeaving(true);
        // Full page load: the dashboard then opens another workspace of
        // theirs, or onboarding if this was their only one.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional: a membership change needs a clean page load
        window.location.assign("/dashboard");
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  const busy = pending || leaving;
  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        <LogOutIcon aria-hidden />
        Leave workspace
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave &quot;{workspaceName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            You lose access to this workspace straight away. To come back, someone in it has to invite you again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={leave} disabled={busy}>
            {busy ? "Leaving…" : "Leave workspace"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
