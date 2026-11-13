"use client";

import { useId, useState, useTransition, type TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createCampaignFolderAction,
  deleteCampaignFolderAction,
  moveCampaignToFolderAction,
  renameCampaignFolderAction,
} from "@/app/actions/campaign-folders";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";

// Campaign folders on the Campaigns page: the folder picker (?folder=…),
// "New folder", rename/delete for the chosen folder, and the "Move to folder"
// dialog used by each campaign row's menu.

export type FolderOption = { id: string; name: string; count: number };

/** Same limit as the server (src/lib/campaigns/folders.ts). */
const NAME_MAX = 50;
const ALL = "all";
const NONE = "none";
const SERVER_DOWN = "Couldn't reach the server. Please try again.";

/** Builds /campaigns?… keeping the search and status filters. */
function campaignsHref(params: { q: string; status: string; folder: string }): string {
  const sp = new URLSearchParams();
  if (params.folder) sp.set("folder", params.folder);
  if (params.q.trim()) sp.set("q", params.q.trim());
  if (params.status) sp.set("status", params.status.toLowerCase());
  const search = sp.toString();
  return search ? `/campaigns?${search}` : "/campaigns";
}

/**
 * The folder row above the campaigns list: a picker with counts, "New folder",
 * and (when a folder is chosen) Rename / Delete.
 */
export function CampaignFolderBar({
  folders,
  total,
  unfiled,
  folder,
  q,
  status,
  canDelete,
}: {
  folders: FolderOption[];
  total: number;
  unfiled: number;
  /** The chosen folder id, "none", or "" for all campaigns. */
  folder: string;
  q: string;
  status: string;
  /** Owners and admins may delete folders. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<null | "create" | "rename" | "delete">(null);
  const current = folders.find((f) => f.id === folder) ?? null;

  const items = [
    { value: ALL, label: `All campaigns (${total.toLocaleString("en")})` },
    { value: NONE, label: `No folder (${unfiled.toLocaleString("en")})` },
    ...folders.map((f) => ({ value: f.id, label: `${f.name} (${f.count.toLocaleString("en")})` })),
  ];

  function go(nextFolder: string) {
    startTransition(() => {
      router.replace(campaignsHref({ q, status, folder: nextFolder }), { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select items={items} value={folder || ALL} onValueChange={(v) => go(!v || v === ALL ? "" : String(v))}>
        <SelectTrigger aria-label="Folder" className="w-full bg-white sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.slice(0, 2).map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
          {folders.length > 0 && <SelectSeparator />}
          {items.slice(2).map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="outline" className="bg-white" onClick={() => setDialog("create")}>
        <FolderPlus aria-hidden />
        New folder
      </Button>

      {current && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label={`Actions for the folder ${current.name}`} />}
          >
            <MoreHorizontal aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => setDialog("rename")}>
              <Pencil aria-hidden />
              Rename folder
            </DropdownMenuItem>
            {canDelete && (
              <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
                <Trash2 aria-hidden />
                Delete folder
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {pending && <Loader2 className="size-4 animate-spin text-zinc-400" aria-label="Loading" />}

      <FolderNameDialog
        open={dialog === "create"}
        onOpenChange={(open) => setDialog(open ? "create" : null)}
        title="New folder"
        description="Group campaigns, for example by season or product. Folders are only for tidying this list."
        submitLabel="Create folder"
        initialName=""
        onSubmit={async (name) => {
          const result = await createCampaignFolderAction(name);
          if (!result.ok) return result.error;
          toast.success(`Folder “${result.name}” created.`);
          go(result.id);
          return null;
        }}
      />
      {current && (
        <>
          <FolderNameDialog
            open={dialog === "rename"}
            onOpenChange={(open) => setDialog(open ? "rename" : null)}
            title="Rename folder"
            submitLabel="Save"
            initialName={current.name}
            onSubmit={async (name) => {
              const result = await renameCampaignFolderAction(current.id, name);
              if (!result.ok) return result.error;
              toast.success("Folder renamed.");
              return null;
            }}
          />
          <DeleteFolderDialog
            folder={current}
            open={dialog === "delete"}
            onOpenChange={(open) => setDialog(open ? "delete" : null)}
            onDeleted={() => go("")}
          />
        </>
      )}
    </div>
  );
}

/** Create / rename: one name box. `onSubmit` returns an error message, or null when done. */
function FolderNameDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initialName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  initialName: string;
  onSubmit: (name: string) => Promise<string | null>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        {/* The form only exists while the dialog is open, so it starts fresh every time. */}
        <FolderNameForm
          title={title}
          description={description}
          submitLabel={submitLabel}
          initialName={initialName}
          onSubmit={onSubmit}
          onDone={() => onOpenChange(false)}
          pending={pending}
          startTransition={startTransition}
        />
      </DialogContent>
    </Dialog>
  );
}

function FolderNameForm({
  title,
  description,
  submitLabel,
  initialName,
  onSubmit,
  onDone,
  pending,
  startTransition,
}: {
  title: string;
  description?: string;
  submitLabel: string;
  initialName: string;
  onSubmit: (name: string) => Promise<string | null>;
  onDone: () => void;
  pending: boolean;
  startTransition: TransitionStartFunction;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the folder a name.");
    startTransition(async () => {
      try {
        const problem = await onSubmit(trimmed);
        if (problem) setError(problem);
        else onDone();
      } catch {
        setError(SERVER_DOWN);
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor={inputId}>Folder name</Label>
        <Input
          id={inputId}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          maxLength={NAME_MAX}
          autoFocus
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteFolderDialog({
  folder,
  open,
  onOpenChange,
  onDeleted,
}: {
  folder: FolderOption;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await deleteCampaignFolderAction(folder.id);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Folder deleted. Its campaigns are now in “No folder”.");
        onOpenChange(false);
        onDeleted();
      } catch {
        toast.error(SERVER_DOWN);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the folder “{folder.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {folder.count > 0
              ? `Its ${folder.count === 1 ? "campaign is" : `${folder.count.toLocaleString("en")} campaigns are`} not deleted: ${folder.count === 1 ? "it moves" : "they move"} to “No folder”.`
              : "The folder is empty, so nothing else changes."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={handleDelete}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Delete folder
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** "Move to folder" for one campaign (opened from its row menu). */
export function MoveToFolderDialog({
  campaign,
  folders,
  open,
  onOpenChange,
}: {
  campaign: { id: string; name: string; folderId: string | null };
  folders: FolderOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        {/* Only exists while open, so it always starts at the campaign's current folder. */}
        <MoveToFolderForm
          campaign={campaign}
          folders={folders}
          onDone={() => onOpenChange(false)}
          pending={pending}
          startTransition={startTransition}
        />
      </DialogContent>
    </Dialog>
  );
}

function MoveToFolderForm({
  campaign,
  folders,
  onDone,
  pending,
  startTransition,
}: {
  campaign: { id: string; name: string; folderId: string | null };
  folders: FolderOption[];
  onDone: () => void;
  pending: boolean;
  startTransition: TransitionStartFunction;
}) {
  const [target, setTarget] = useState(campaign.folderId ?? NONE);
  const selectId = useId();

  const items = [{ value: NONE, label: "No folder" }, ...folders.map((f) => ({ value: f.id, label: f.name }))];

  function move() {
    startTransition(async () => {
      try {
        const result = await moveCampaignToFolderAction(campaign.id, target === NONE ? null : target);
        if (!result.ok) return void toast.error(result.error);
        const name = folders.find((f) => f.id === target)?.name;
        toast.success(name ? `Moved to “${name}”.` : "Moved to “No folder”.");
        onDone();
      } catch {
        toast.error(SERVER_DOWN);
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Move to folder</DialogTitle>
        <DialogDescription>
          Choose a folder for “{campaign.name}”.
          {folders.length === 0 && " You don't have any folders yet: create one with “New folder” above the list."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor={selectId}>Folder</Label>
        <Select items={items} value={target} onValueChange={(v) => setTarget(v ? String(v) : NONE)}>
          <SelectTrigger id={selectId} className="w-full">
            <SelectValue />
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
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={move} disabled={pending || target === (campaign.folderId ?? NONE)}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Move
        </Button>
      </DialogFooter>
    </>
  );
}
