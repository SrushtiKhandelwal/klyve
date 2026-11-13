"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyAuthError } from "@/components/auth/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

// Your display name: shown to teammates (Settings → Team, "invited by ...")
// and in the emails Klyve sends you.

const NAME_MAX = 80;

export function NameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const cleaned = name.replace(/\s+/g, " ").trim();
    if (!cleaned) return setError("Please enter your name.");
    if (cleaned.length > NAME_MAX) return setError(`Please keep it under ${NAME_MAX} characters.`);

    startTransition(async () => {
      const { error: authError } = await authClient.updateUser({ name: cleaned });
      if (authError) return setError(friendlyAuthError(authError));
      setName(cleaned);
      setSaved(cleaned);
      toast.success("Name saved.");
      // The sidebar's user menu shows the name too: re-render it.
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>Your name</Label>
        <Input
          id={id}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          autoComplete="name"
          disabled={pending}
          className="h-9 bg-white sm:max-w-sm"
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div>
        <Button type="submit" disabled={pending || name.trim() === saved || !name.trim()}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Saving…" : "Save name"}
        </Button>
      </div>
    </form>
  );
}
