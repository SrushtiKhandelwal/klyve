"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Loader2, MoreHorizontal, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { deleteCampaignAction, duplicateCampaignAction } from "@/app/actions/campaigns";
import { CampaignStatusBadge } from "@/components/campaigns/campaign-status-badge";
import { LocalDateTime, RelativeTime } from "@/components/campaigns/local-time";
import { DELETABLE_STATUSES, formatCount, type CampaignRowView } from "@/components/campaigns/types";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The campaigns list. One row per campaign; on phones each row stacks into a
 * small card, so nothing ever scrolls sideways.
 */
export function CampaignsList({ rows }: { rows: CampaignRowView[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-white">
      {rows.map((row) => (
        <CampaignRow key={row.id} row={row} />
      ))}
    </ul>
  );
}

function CampaignRow({ row }: { row: CampaignRowView }) {
  const href = `/campaigns/${row.id}`;
  const notStarted = row.status === "DRAFT" || row.status === "SCHEDULED";

  return (
    <li className="relative flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-zinc-50/70 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 truncate font-medium text-zinc-900">
            {/* The whole row is clickable: this link's ::after covers it. */}
            <Link href={href} className="outline-none after:absolute after:inset-0 focus-visible:underline">
              {row.name}
            </Link>
          </h3>
          <CampaignStatusBadge status={row.status} className="sm:hidden" />
        </div>
        <p className="mt-0.5 truncate text-sm text-zinc-500">
          {row.subject ? row.subject : <span className="italic">No subject yet</span>}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          <CampaignWhen row={row} />
        </p>
      </div>

      <div className="flex items-center gap-4 text-sm sm:gap-6">
        <CampaignStatusBadge status={row.status} className="hidden w-24 justify-center sm:inline-flex" />

        <div className="flex min-w-24 flex-col">
          <span className="text-xs text-zinc-500">Recipients</span>
          <span className="font-medium text-zinc-900 tabular-nums">
            {notStarted && row.recipientCount === 0 ? "—" : formatCount(row.recipientCount)}
          </span>
        </div>

        <div className="flex min-w-28 flex-col">
          <span className="text-xs text-zinc-500">Sent / failed</span>
          <span className="tabular-nums">
            {notStarted ? (
              <span className="text-zinc-400">—</span>
            ) : (
              <>
                <span className="font-medium text-emerald-700">{formatCount(row.sentCount)}</span>
                <span className="text-zinc-400"> / </span>
                <span className={row.failedCount > 0 ? "font-medium text-red-600" : "text-zinc-500"}>
                  {formatCount(row.failedCount)}
                </span>
              </>
            )}
          </span>
        </div>

        {/* Above the row's big link, so the menu stays clickable. */}
        <div className="relative z-10 ml-auto">
          <CampaignRowMenu row={row} />
        </div>
      </div>
    </li>
  );
}

/** The date that matters for this status: "Scheduled for …", "Sent …", "Draft · edited …". */
export function CampaignWhen({ row }: { row: Pick<CampaignRowView, "status" | "scheduledAt" | "startedAt" | "finishedAt" | "updatedAt"> }) {
  switch (row.status) {
    case "SCHEDULED":
      return row.scheduledAt ? (
        <span className="font-medium text-sky-700">
          Scheduled for <LocalDateTime iso={row.scheduledAt} />
        </span>
      ) : (
        <>Scheduled</>
      );
    case "SENDING":
      return row.startedAt ? (
        <>
          Sending · started <RelativeTime iso={row.startedAt} />
        </>
      ) : (
        <>Sending now</>
      );
    case "PAUSED":
      return (
        <>
          Paused · last change <RelativeTime iso={row.updatedAt} />
        </>
      );
    case "SENT":
      return (
        <>
          Sent <LocalDateTime iso={row.finishedAt ?? row.updatedAt} />
        </>
      );
    case "CANCELLED":
      return (
        <>
          Cancelled <LocalDateTime iso={row.finishedAt ?? row.updatedAt} />
        </>
      );
    case "FAILED":
      return (
        <>
          Failed <LocalDateTime iso={row.finishedAt ?? row.updatedAt} />
        </>
      );
    default:
      return (
        <>
          Draft · edited <RelativeTime iso={row.updatedAt} />
        </>
      );
  }
}

function CampaignRowMenu({ row }: { row: CampaignRowView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canDelete = DELETABLE_STATUSES.includes(row.status);

  function duplicate() {
    startTransition(async () => {
      try {
        const result = await duplicateCampaignAction(row.id);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Campaign duplicated as a new draft.");
        router.push(`/campaigns/${result.id}`);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.name}`} disabled={pending} />}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => router.push(`/campaigns/${row.id}`)}>
            {row.status === "DRAFT" ? <ExternalLink aria-hidden /> : <Users aria-hidden />}
            {row.status === "DRAFT" ? "Open" : "View progress"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={duplicate}>
            <Copy aria-hidden />
            Duplicate
          </DropdownMenuItem>
          {canDelete && (
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
      <DeleteCampaignDialog
        campaignId={row.id}
        name={row.name}
        sent={row.status !== "DRAFT"}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}

export function DeleteCampaignDialog({
  campaignId,
  name,
  sent,
  open,
  onOpenChange,
  onDeleted,
}: {
  campaignId: string;
  name: string;
  /** Already went out (or tried to): the warning mentions losing its results. */
  sent: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await deleteCampaignAction(campaignId);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Campaign deleted.");
        onOpenChange(false);
        onDeleted?.();
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
            {sent
              ? "Its results and the list of who received it are removed for everyone in this workspace. Emails that already went out stay in people's inboxes. This can't be undone."
              : "This draft is removed for everyone in this workspace. This can't be undone."}
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
