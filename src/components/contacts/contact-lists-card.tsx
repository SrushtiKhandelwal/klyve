"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  addContactToList,
  removeContactFromList,
  type ContactActionResult,
} from "@/app/actions/contacts";
import type { ListOption } from "@/lib/contacts/lookups";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** The lists a contact is in, with remove buttons and an "Add to list" picker. */
export function ContactListsCard({
  contactId,
  memberOf,
  allLists,
}: {
  contactId: string;
  memberOf: { id: string; name: string }[];
  allLists: ListOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<string | null>(null);
  // Which list's remove button is spinning (so only that one shows a spinner).
  const [busyId, setBusyId] = useState<string | null>(null);

  const memberIds = new Set(memberOf.map((l) => l.id));
  const available = allLists
    .filter((l) => !memberIds.has(l.id))
    .map((l) => ({ value: l.id, label: l.name }));
  const listId = available.some((i) => i.value === picked) ? picked : null;

  function run(busy: string, action: () => Promise<ContactActionResult>) {
    setBusyId(busy);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          toast.success(result.message);
          if (busy === "add") setPicked(null);
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      {memberOf.length === 0 ? (
        <p className="text-sm text-zinc-500">Not in any list yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {memberOf.map((list) => (
            <li key={list.id} className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
              <Link
                href={`/contacts/lists/${list.id}`}
                className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 hover:text-emerald-700 hover:underline"
              >
                {list.name}
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label={`Remove from ${list.name}`}
                title={`Remove from ${list.name}`}
                onClick={() =>
                  run(list.id, () => removeContactFromList({ contactId, listId: list.id }))
                }
              >
                {busyId === list.id ? <Loader2 className="animate-spin" /> : <X />}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {allLists.length === 0 ? (
        <p className="text-sm text-zinc-500">
          <Link href="/contacts/lists" className="font-medium text-emerald-700 hover:underline">
            Create a list
          </Link>{" "}
          to start grouping contacts.
        </p>
      ) : available.length === 0 ? (
        <p className="text-sm text-zinc-500">This contact is in every list.</p>
      ) : (
        <div className="flex gap-2">
          <Select items={available} value={listId} onValueChange={(v) => setPicked(v)}>
            <SelectTrigger aria-label="Choose a list" className="min-w-0 flex-1">
              <SelectValue placeholder="Choose a list" />
            </SelectTrigger>
            <SelectContent>
              {available.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={!listId || pending}
            onClick={() => {
              if (listId) run("add", () => addContactToList({ contactId, listId }));
            }}
          >
            {busyId === "add" ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
