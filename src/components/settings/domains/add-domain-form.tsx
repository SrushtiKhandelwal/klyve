"use client";

import { useState, useTransition } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { addDomain } from "@/app/actions/domains";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FREE_MAIL_NOTE, isFreeMailDomain } from "./free-mail";

export type DomainSuggestionView = { domain: string; senderCount: number; freeMail: boolean };

/** Domain input, plus one-click suggestions taken from the workspace's senders. */
export function AddDomainForm({ suggestions }: { suggestions: DomainSuggestionView[] }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(domain: string) {
    setError(null);
    startTransition(async () => {
      const result = await addDomain(domain);
      if (result.ok) {
        toast.success(`${result.domain} added and checked.`);
        setValue("");
      } else {
        setError(result.error);
      }
    });
  }

  const typedDomain = value.trim().toLowerCase().replace(/^.*@/, "");
  const freeMail = typedDomain.includes(".") && isFreeMailDomain(typedDomain);

  return (
    <div className="grid gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add(value);
        }}
        className="grid gap-1.5"
      >
        <Label htmlFor="new-domain">Domain</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="new-domain"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder="acme.com"
            autoComplete="off"
            spellCheck={false}
            maxLength={253}
            aria-invalid={error ? true : undefined}
            className="sm:flex-1"
          />
          <Button type="submit" disabled={pending || !value.trim()}>
            <PlusIcon />
            {pending ? "Adding…" : "Add domain"}
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {freeMail && <p className="text-xs text-amber-700">{FREE_MAIL_NOTE}</p>}
      </form>

      {suggestions.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-medium text-zinc-500">From your senders</p>
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li key={s.domain}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => add(s.domain)}
                  title={s.freeMail ? FREE_MAIL_NOTE : `Add ${s.domain}`}
                  className="h-auto flex-wrap justify-start py-1 text-left whitespace-normal"
                >
                  <PlusIcon />
                  <span className="font-medium">{s.domain}</span>
                  <span className="text-zinc-500">
                    (used by {s.senderCount} {s.senderCount === 1 ? "sender" : "senders"})
                  </span>
                  {s.freeMail && <span className="text-amber-700">· free mailbox</span>}
                </Button>
              </li>
            ))}
          </ul>
          {suggestions.some((s) => s.freeMail) && (
            <p className="text-xs text-zinc-500">
              Free mailbox domains (like gmail.com) can be checked, but you can&apos;t change their DNS, and they
              are poor for bulk sending.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
