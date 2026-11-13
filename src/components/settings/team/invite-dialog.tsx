"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { Loader2, MailIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { inviteMemberAction } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type AssignableRole } from "@/lib/team/roles";

// "Invite someone": email + role. The server emails them a link that's valid
// for 7 days. Owners can pick Admin or Member; admins can only invite members.

export function InviteDialog({ roles, disabled }: { roles: AssignableRole[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const emailId = useId();
  const roleName = useId();

  function reset() {
    setEmail("");
    setRole("MEMBER");
    setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const typed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) {
      setError("Please enter a valid email address.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await inviteMemberAction({ email: typed, role });
        if (!result.ok) return setError(result.error);
        toast.success(`Invite sent to ${typed.toLowerCase()}.`);
        setOpen(false);
        reset();
      } catch {
        setError("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger render={<Button disabled={disabled} />}>
        <UserPlusIcon aria-hidden />
        Invite someone
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite someone to your workspace</DialogTitle>
          <DialogDescription>
            We&apos;ll email them a link to join. It works for 7 days. They log in (or create a free account) with this
            email address to accept.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={emailId}>Email address</Label>
            <Input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              placeholder="teammate@example.com"
              autoComplete="off"
              autoFocus
              disabled={pending}
              aria-invalid={error ? true : undefined}
            />
          </div>

          <fieldset className="flex flex-col gap-2" disabled={pending}>
            <legend className="mb-1.5 text-sm font-medium">Role</legend>
            {roles.map((r) => (
              <label
                key={r}
                className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 has-checked:border-emerald-500 has-checked:bg-emerald-50/50"
              >
                <input
                  type="radio"
                  name={roleName}
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="mt-1 accent-emerald-600"
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium text-zinc-900">{ROLE_LABELS[r]}</span>
                  <span className="text-xs text-zinc-500">{ROLE_DESCRIPTIONS[r]}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !email.trim()}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <MailIcon aria-hidden />}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
