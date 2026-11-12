"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ListMinus, ListPlus, Loader2, MailX, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  bulkAddToList,
  bulkDeleteContacts,
  bulkRemoveFromList,
  bulkUnsubscribeContacts,
  type ContactActionResult,
} from "@/app/actions/contacts";
import type { EngagementBadge } from "@/lib/contacts/activity";
import type { ContactStatusValue } from "@/lib/contacts/common";
import type { ListOption } from "@/lib/contacts/lookups";
import { ContactStatusBadge } from "@/components/contacts/contact-status-badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** One table row, already prepared on the server (dates formatted there). */
export type ContactsTableRow = {
  id: string;
  /** "Priya Sharma", or null when no name is saved. */
  name: string | null;
  email: string;
  status: ContactStatusValue;
  listCount: number;
  addedAt: string; // ISO date, for <time dateTime>
  addedLabel: string; // e.g. "11 Nov 2026"
  engagement: EngagementBadge;
  /** Last real open or click, e.g. "11 Nov 2026" (null = never). */
  lastActivityLabel: string | null;
};

// How engaged a contact is (see getEngagementForContacts). "Not emailed" shows a dash.
const ENGAGEMENT_META: Record<Exclude<EngagementBadge, "NOT_EMAILED">, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  INACTIVE: { label: "Inactive 90d", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  NEVER_OPENED: { label: "Never opened", className: "bg-zinc-100 text-zinc-600 ring-zinc-500/20" },
};

// What the open dialog is about. We copy the selected ids when it opens so
// the dialog text stays right even after the selection is cleared.
type Confirm = { kind: "delete" | "unsubscribe"; ids: string[] } | null;
type ListMode = { kind: "add" | "remove"; ids: string[] } | null;

export function ContactsTable({ rows, lists }: { rows: ContactsTableRow[]; lists: ListOption[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [listMode, setListMode] = useState<ListMode>(null);

  // Only count rows that are still on screen (e.g. after a delete elsewhere).
  const selectedIds = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Runs a bulk Server Action, shows the result, clears the selection on success. */
  function run(action: () => Promise<ContactActionResult>, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          toast.success(result.message);
          setSelected(new Set());
          onSuccess?.();
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {selectedIds.length > 0 && (
        <div
          role="toolbar"
          aria-label="Actions for selected contacts"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2"
        >
          <span className="mr-auto text-sm font-medium text-emerald-900">
            {selectedIds.length} selected
          </span>
          {pending && <Loader2 className="size-4 animate-spin text-emerald-700" aria-label="Working" />}
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setListMode({ kind: "add", ids: selectedIds })}>
            <ListPlus aria-hidden />
            Add to list
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setListMode({ kind: "remove", ids: selectedIds })}>
            <ListMinus aria-hidden />
            Remove from list
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirm({ kind: "unsubscribe", ids: selectedIds })}>
            <MailX aria-hidden />
            Unsubscribe
          </Button>
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => setConfirm({ kind: "delete", ids: selectedIds })}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white">
        <Table>
          <TableHeader className="bg-zinc-50/80">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 pl-4">
                <Checkbox
                  aria-label="Select all contacts on this page"
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={(checked) =>
                    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set())
                  }
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Engagement</TableHead>
              <TableHead className="text-right">Lists</TableHead>
              <TableHead className="pr-4">Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isSelected = selected.has(row.id);
              return (
                <TableRow
                  key={row.id}
                  data-state={isSelected ? "selected" : undefined}
                  className={cn(isSelected && "bg-emerald-50/40")}
                >
                  <TableCell className="pl-4">
                    <Checkbox
                      aria-label={`Select ${row.name ?? row.email}`}
                      checked={isSelected}
                      onCheckedChange={(checked) => toggleRow(row.id, checked)}
                    />
                  </TableCell>
                  <TableCell className="max-w-56">
                    <Link
                      href={`/contacts/${row.id}`}
                      className="block truncate font-medium text-zinc-900 hover:text-emerald-700 hover:underline"
                    >
                      {row.name ?? <span className="font-normal text-zinc-400 italic">No name</span>}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-zinc-600">{row.email}</TableCell>
                  <TableCell>
                    <ContactStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>
                    <EngagementCell row={row} />
                  </TableCell>
                  <TableCell className="text-right text-zinc-600 tabular-nums">{row.listCount}</TableCell>
                  <TableCell className="pr-4 text-zinc-500">
                    <time dateTime={row.addedAt}>{row.addedLabel}</time>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Confirmation for delete / unsubscribe */}
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && !pending && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "delete" ? "Delete" : "Unsubscribe"} {countLabel(confirm?.ids.length ?? 0)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete"
                ? "They will be removed from all lists. This can't be undone."
                : "They won't receive campaigns any more. Bounced and complained contacts are left as they are."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant={confirm?.kind === "delete" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => {
                if (!confirm) return;
                const { kind, ids } = confirm;
                run(
                  () => (kind === "delete" ? bulkDeleteContacts(ids) : bulkUnsubscribeContacts(ids)),
                  () => setConfirm(null),
                );
              }}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {confirm?.kind === "delete" ? "Delete" : "Unsubscribe"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ListPickerDialog
        mode={listMode}
        lists={lists}
        pending={pending}
        onClose={() => setListMode(null)}
        onConfirm={(listId) => {
          if (!listMode) return;
          const { kind, ids } = listMode;
          run(
            () =>
              kind === "add"
                ? bulkAddToList({ contactIds: ids, listId })
                : bulkRemoveFromList({ contactIds: ids, listId }),
            () => setListMode(null),
          );
        }}
      />
    </div>
  );
}

/** Small dialog to choose which list to add the selected contacts to (or remove them from). */
function ListPickerDialog({
  mode,
  lists,
  pending,
  onClose,
  onConfirm,
}: {
  mode: ListMode;
  lists: ListOption[];
  pending: boolean;
  onClose: () => void;
  onConfirm: (listId: string) => void;
}) {
  // Remembers the last list picked, which is handy when doing several pages.
  const [picked, setPicked] = useState<string | null>(null);
  const items = lists.map((l) => ({ value: l.id, label: l.name }));
  // Ignore a remembered list that has since been deleted.
  const listId = items.some((i) => i.value === picked) ? picked : null;
  const who = countLabel(mode?.ids.length ?? 0);
  const removing = mode?.kind === "remove";

  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{removing ? "Remove from list" : "Add to list"}</DialogTitle>
          <DialogDescription>
            {removing
              ? `Choose the list to remove ${who} from.`
              : `Choose the list to add ${who} to. People already in it are skipped.`}
          </DialogDescription>
        </DialogHeader>

        {lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You don&apos;t have any lists yet.{" "}
            <Link href="/contacts/lists" className="font-medium text-emerald-700 hover:underline">
              Create a list
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="bulk-list-picker">List</Label>
            <Select items={items} value={listId} onValueChange={(v) => setPicked(v)}>
              <SelectTrigger id="bulk-list-picker" className="w-full">
                <SelectValue placeholder="Choose a list" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          <Button
            disabled={!listId || pending}
            onClick={() => {
              if (listId) onConfirm(listId);
            }}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {removing ? "Remove" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EngagementCell({ row }: { row: ContactsTableRow }) {
  if (row.engagement === "NOT_EMAILED") {
    return <span className="text-zinc-400" title="No campaigns sent to this contact yet">—</span>;
  }
  const meta = ENGAGEMENT_META[row.engagement];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        meta.className,
      )}
      title={row.lastActivityLabel ? `Last opened or clicked ${row.lastActivityLabel}` : "Never opened or clicked"}
    >
      {meta.label}
    </span>
  );
}

function countLabel(n: number) {
  return `${n} ${n === 1 ? "contact" : "contacts"}`;
}
