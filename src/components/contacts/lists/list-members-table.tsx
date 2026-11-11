"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import { removeContactsFromList } from "@/app/actions/lists";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CONTACT_STATUS_META, type ContactStatusValue } from "@/lib/contacts/common";
import { cn } from "@/lib/utils";

/** One row, already formatted on the server (plain text only). */
export type MemberRow = {
  id: string;
  email: string;
  /** Full name, or null when the contact has no name saved. */
  name: string | null;
  status: ContactStatusValue;
  addedAt: string;
};

/** The members of one list, with checkboxes for removing several at once. */
export function ListMembersTable({
  listId,
  listName,
  members,
}: {
  listId: string;
  listName: string;
  members: MemberRow[];
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Which row's remove button is spinning (null = the bulk action).
  const [busyId, setBusyId] = useState<string | null>(null);

  // Only count selections that are still on screen (rows can disappear after
  // a removal or when the page changes).
  const selectedIds = members.filter((m) => selected.has(m.id)).map((m) => m.id);
  const allSelected = members.length > 0 && selectedIds.length === members.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(members.map((m) => m.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function remove(ids: string[], rowId: string | null) {
    setBusyId(rowId);
    startTransition(async () => {
      const result = await removeContactsFromList(listId, ids);
      if (result.ok) {
        toast.success(
          result.removed === 1
            ? `Removed 1 contact from “${listName}”`
            : `Removed ${result.removed.toLocaleString("en")} contacts from “${listName}”`,
          { description: "The contacts are still in All contacts." },
        );
        setSelected((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
        setConfirmOpen(false);
      } else {
        toast.error(result.error);
      }
      setBusyId(null);
    });
  }

  return (
    <div className="flex min-w-0 flex-col">
      {/* Bulk actions bar: only while something is selected. */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-emerald-50/60 px-4 py-2.5 text-sm">
          <span className="font-medium text-emerald-900">
            {selectedIds.length.toLocaleString("en")} selected
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={pending}>
            <X aria-hidden />
            Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto text-red-700 hover:text-red-800"
            onClick={() => setConfirmOpen(true)}
            disabled={pending}
          >
            <UserMinus aria-hidden />
            Remove from list
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 pl-4">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={(checked) => toggleAll(checked)}
                aria-label="Select all contacts on this page"
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="hidden sm:table-cell">Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Added</TableHead>
            <TableHead className="w-12 pr-4">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const meta = CONTACT_STATUS_META[member.status];
            const isSelected = selected.has(member.id);
            return (
              <TableRow key={member.id} data-state={isSelected ? "selected" : undefined}>
                <TableCell className="pl-4">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => toggleOne(member.id, checked)}
                    aria-label={`Select ${member.name ?? member.email}`}
                  />
                </TableCell>
                <TableCell className="max-w-[11rem] sm:max-w-[14rem]">
                  <Link
                    href={`/contacts/${member.id}`}
                    className="block truncate font-medium text-zinc-900 hover:text-emerald-700 hover:underline"
                  >
                    {member.name ?? member.email}
                  </Link>
                  {/* On phones the email column is hidden, so show it here. */}
                  {member.name && (
                    <span className="block truncate text-xs text-zinc-500 sm:hidden">
                      {member.email}
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-[16rem] truncate text-zinc-600 sm:table-cell">
                  {member.email}
                </TableCell>
                <TableCell>
                  <Badge
                    title={meta.description}
                    className={cn("ring-1 ring-inset", meta.className)}
                  >
                    {meta.label}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-zinc-500 md:table-cell">{member.addedAt}</TableCell>
                <TableCell className="pr-4 text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove([member.id], member.id)}
                    disabled={pending}
                    aria-label={`Remove ${member.name ?? member.email} from the list`}
                    title="Remove from list"
                  >
                    {pending && busyId === member.id ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <UserMinus aria-hidden />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog open={confirmOpen} onOpenChange={(next) => !pending && setConfirmOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {selectedIds.length === 1 ? "1 contact" : `${selectedIds.length} contacts`} from
              this list?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They’ll no longer get campaigns sent to “{listName}”. The contacts themselves are kept
              in All contacts and in any other lists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove(selectedIds, null)}
              disabled={pending || selectedIds.length === 0}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending && busyId === null && <Loader2 className="animate-spin" aria-hidden />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
