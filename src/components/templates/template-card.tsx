"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Loader2, MoreHorizontal, Pencil, PenLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTemplateAction, duplicateTemplateAction, renameTemplateAction } from "@/app/actions/templates";
import { SavedTemplateThumbnail } from "@/components/templates/email-thumbnail";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TemplateCardData = {
  id: string;
  name: string;
  subject: string;
  /** ISO time, also used to refresh the preview after edits. */
  updatedAt: string;
  /** "Edited 3 hours ago", worked out on the server. */
  updatedLabel: string;
  canDelete: boolean;
};

/** One saved template: live preview, name, and Edit / Duplicate / Rename / Delete. */
export function TemplateCard({ template }: { template: TemplateCardData }) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const href = `/templates/${template.id}`;

  function duplicate() {
    startTransition(async () => {
      try {
        const result = await duplicateTemplateAction(template.id);
        if (!result.ok) toast.error(result.error);
        else
          toast.success("Template duplicated.", {
            action: { label: "Open", onClick: () => router.push(`/templates/${result.templateId}`) },
          });
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md">
      <Link href={href} className="block border-b outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40" aria-label={`Edit ${template.name}`}>
        <SavedTemplateThumbnail id={template.id} version={template.updatedAt} title={`Preview of ${template.name}`} />
      </Link>
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-zinc-900">
            <Link href={href} className="hover:underline">
              {template.name}
            </Link>
          </h3>
          <p className="truncate text-xs text-zinc-500">
            <time dateTime={template.updatedAt}>{template.updatedLabel}</time>
            {template.subject && <> · {template.subject}</>}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${template.name}`} disabled={pending} />}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => router.push(href)}>
              <Pencil aria-hidden />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={duplicate}>
              <Copy aria-hidden />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setRenameOpen(true)}>
              <PenLine aria-hidden />
              Rename
            </DropdownMenuItem>
            {template.canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <RenameTemplateDialog
        templateId={template.id}
        currentName={template.name}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
      <DeleteTemplateDialog
        templateId={template.id}
        name={template.name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </article>
  );
}

function RenameTemplateDialog({
  templateId,
  currentName,
  open,
  onOpenChange,
}: {
  templateId: string;
  currentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    startTransition(async () => {
      try {
        const result = await renameTemplateAction(templateId, name);
        if (!result.ok) return setError(result.error);
        toast.success("Template renamed.");
        onOpenChange(false);
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
        setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename template</DialogTitle>
          <DialogDescription>Only you and your team see this name.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`rename-${templateId}`}>Name</Label>
            <Input
              id={`rename-${templateId}`}
              name="name"
              defaultValue={currentName}
              maxLength={100}
              autoFocus
              required
              disabled={pending}
              aria-invalid={error ? true : undefined}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTemplateDialog({
  templateId,
  name,
  open,
  onOpenChange,
}: {
  templateId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await deleteTemplateAction(templateId);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Template deleted.");
        onOpenChange(false);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The design is removed for everyone in this workspace. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={handleDelete}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
