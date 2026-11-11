"use client";

import { useState, useTransition } from "react";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteList } from "@/app/actions/lists";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListFormDialog, type EditableList } from "./list-form-dialog";

/**
 * The "⋯" menu with Edit and Delete for one list.
 * On the list's own page, set `onListPage` so deleting goes back to all lists.
 */
export function ListActionsMenu({
  list,
  totalMembers,
  onListPage = false,
}: {
  list: EditableList;
  totalMembers: number;
  onListPage?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant={onListPage ? "outline" : "ghost"}
              size={onListPage ? "icon" : "icon-sm"}
              aria-label={`More actions for ${list.name}`}
            />
          }
        >
          <MoreHorizontal aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ListFormDialog list={list} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteListDialog
        list={list}
        totalMembers={totalMembers}
        onListPage={onListPage}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}

function DeleteListDialog({
  list,
  totalMembers,
  onListPage,
  open,
  onOpenChange,
}: {
  list: EditableList;
  totalMembers: number;
  onListPage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      // On the list's own page the server sends us back to all lists, so the
      // code below only runs when we stay where we are (or something failed).
      const result = await deleteList(list.id, { redirectToLists: onListPage });
      if (result.ok) {
        toast.success(`“${list.name}” deleted`);
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  const contactsText =
    totalMembers === 1
      ? "The 1 contact in it is kept"
      : `The ${totalMembers.toLocaleString("en")} contacts in it are kept`;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{list.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {totalMembers === 0
              ? "The list is empty, so no contacts are affected."
              : `${contactsText}: they stay in All contacts and in any other lists. Only the list itself is removed.`}{" "}
            This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={pending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Deleting…" : "Delete list"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
