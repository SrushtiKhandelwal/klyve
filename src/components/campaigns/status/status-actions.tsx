"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarX, Copy, Loader2, MoreHorizontal, Pause, Play, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  cancelCampaignAction,
  duplicateCampaignAction,
  pauseCampaignAction,
  resumeCampaignAction,
  unscheduleCampaignAction,
} from "@/app/actions/campaigns";
import { DeleteCampaignDialog } from "@/components/campaigns/campaigns-list";
import { DELETABLE_STATUSES } from "@/components/campaigns/types";
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
import type { CampaignStatusValue } from "@/lib/campaigns/status";

type Busy = "pause" | "resume" | "cancel" | "unschedule" | "duplicate" | null;

/**
 * The buttons that make sense for the campaign's status right now:
 *   SCHEDULED → Unschedule, Cancel   SENDING → Pause, Cancel
 *   PAUSED → Resume, Cancel          finished → Duplicate (and Delete)
 * Each action re-renders the page on the server, so the status updates.
 */
export function CampaignStatusActions({
  campaignId,
  name,
  status,
  canDelete,
}: {
  campaignId: string;
  name: string;
  status: CampaignStatusValue;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function run(kind: Exclude<Busy, null>, action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, after?: () => void) {
    setBusy(kind);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) toast.error(result.error);
        else {
          toast.success(success);
          after?.();
        }
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      } finally {
        setBusy(null);
      }
    });
  }

  function duplicate() {
    setBusy("duplicate");
    startTransition(async () => {
      try {
        const result = await duplicateCampaignAction(campaignId);
        if (!result.ok) {
          toast.error(result.error);
          setBusy(null);
          return;
        }
        toast.success("Copied into a new draft.");
        router.push(`/campaigns/${result.id}`);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
        setBusy(null);
      }
    });
  }

  const spin = (kind: Busy) => busy === kind && <Loader2 className="animate-spin" aria-hidden />;
  const canCancel = status === "SCHEDULED" || status === "SENDING" || status === "PAUSED";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "SENDING" && (
        <Button variant="outline" disabled={!!busy} onClick={() => run("pause", () => pauseCampaignAction(campaignId), "Paused. Nothing more is sent until you resume.")}>
          {spin("pause") || <Pause aria-hidden />}
          Pause
        </Button>
      )}
      {status === "PAUSED" && (
        <Button disabled={!!busy} onClick={() => run("resume", () => resumeCampaignAction(campaignId), "Sending again.")}>
          {spin("resume") || <Play aria-hidden />}
          Resume
        </Button>
      )}
      {status === "SCHEDULED" && (
        <Button
          variant="outline"
          disabled={!!busy}
          onClick={() => run("unschedule", () => unscheduleCampaignAction(campaignId), "Unscheduled. It's a draft again, so you can edit it.")}
        >
          {spin("unschedule") || <CalendarX aria-hidden />}
          Unschedule
        </Button>
      )}
      {canCancel && (
        <Button variant="destructive" disabled={!!busy} onClick={() => setCancelOpen(true)}>
          {spin("cancel") || <XCircle aria-hidden />}
          Cancel campaign
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" disabled={!!busy} />}>
          {busy === "duplicate" ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={duplicate}>
            <Copy aria-hidden />
            Duplicate as draft
          </DropdownMenuItem>
          {canDelete && DELETABLE_STATUSES.includes(status) && (
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

      <AlertDialog open={cancelOpen} onOpenChange={(open) => !busy && setCancelOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {status === "SCHEDULED"
                ? "It won't be sent. To change it and send later instead, use Unschedule."
                : "Nobody else gets it: everyone still waiting is skipped. Emails already sent can't be recalled. You can't restart a cancelled campaign, but you can duplicate it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Keep it</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!!busy}
              onClick={() => run("cancel", () => cancelCampaignAction(campaignId), "Campaign cancelled.", () => setCancelOpen(false))}
            >
              {spin("cancel")}
              Cancel campaign
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteCampaignDialog
        campaignId={campaignId}
        name={name}
        sent
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push("/campaigns")}
      />
    </div>
  );
}
