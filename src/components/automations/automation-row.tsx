"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Copy, Loader2, MoreHorizontal, Pause, Pencil, Play, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { activateAutomationAction, duplicateAutomationAction, pauseAutomationAction } from "@/app/actions/automations";
import { ActivationProblemsDialog, DeleteAutomationDialog } from "@/components/automations/automation-dialogs";
import { AutomationStatusBadge } from "@/components/automations/automation-status-badge";
import { TRIGGER_ICONS } from "@/components/automations/icons";
import type { Part } from "@/components/automations/describe";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AutomationTrigger } from "@/lib/automations/schema";
import { cn } from "@/lib/utils";

export type AutomationRowData = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  triggerType: AutomationTrigger["type"];
  /** "When someone joins **Newsletter**", worked out on the server. */
  triggerParts: Part[];
  stepCount: number;
  activeCount: number;
  completedCount: number;
  /** ISO time + "12 Nov 2026", worked out on the server. */
  createdAt: string;
  createdLabel: string;
};

const numberFormat = new Intl.NumberFormat("en");

/** One automation on /automations: what starts it, how many people are in it, and its actions. */
export function AutomationRow({ automation, canManage }: { automation: AutomationRowData; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [problems, setProblems] = useState<string[] | null>(null);
  const href = `/automations/${automation.id}`;
  const Icon = TRIGGER_ICONS[automation.triggerType];

  function duplicate() {
    startTransition(async () => {
      try {
        const result = await duplicateAutomationAction(automation.id);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Automation duplicated as a draft.", {
          action: { label: "Open", onClick: () => router.push(`/automations/${result.automationId}`) },
        });
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  function toggle() {
    startTransition(async () => {
      try {
        if (automation.status === "ACTIVE") {
          const result = await pauseAutomationAction(automation.id);
          if (!result.ok) return void toast.error(result.error);
          toast.success("Paused. Nobody new enters; people already in it wait where they are.");
        } else {
          const result = await activateAutomationAction(automation.id);
          if (result.ok) return void toast.success("It's on! New people will go through it automatically.");
          if (result.problems?.length) return setProblems(result.problems);
          toast.error(result.error ?? "Couldn't turn it on.");
        }
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <li className="group relative flex items-start gap-3 rounded-xl border bg-white p-4 transition-shadow hover:shadow-md sm:items-center">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          automation.status === "ACTIVE" ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-500",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="min-w-0 truncate font-medium text-zinc-900">
            {/* The whole card is clickable through this link's stretched ::after. */}
            <Link href={href} className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-emerald-500/40">
              {automation.name}
            </Link>
          </h3>
          <AutomationStatusBadge status={automation.status} />
        </div>
        <p className="truncate text-sm text-zinc-600">
          {automation.triggerParts.map((p, i) => (
            <span key={i} className={cn(p.strong && "font-medium text-zinc-900", p.missing && "text-amber-700")}>
              {p.text}
            </span>
          ))}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1" title="People in it right now">
            <UsersRound className="size-3.5" aria-hidden />
            {numberFormat.format(automation.activeCount)} in progress
          </span>
          <span className="inline-flex items-center gap-1" title="People who reached the end">
            <CircleCheck className="size-3.5" aria-hidden />
            {numberFormat.format(automation.completedCount)} completed
          </span>
          <span>
            {automation.stepCount} step{automation.stepCount === 1 ? "" : "s"}
          </span>
          <span>
            Created <time dateTime={automation.createdAt}>{automation.createdLabel}</time>
          </span>
        </p>
      </div>

      {/* Above the stretched link, so the menu stays clickable. */}
      <div className="relative z-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${automation.name}`} disabled={pending} />}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => router.push(href)}>
              <Pencil aria-hidden />
              {automation.status === "ACTIVE" ? "Open" : "Edit"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={duplicate}>
              <Copy aria-hidden />
              Duplicate
            </DropdownMenuItem>
            {canManage && (
              <DropdownMenuItem onClick={toggle}>
                {automation.status === "ACTIVE" ? <Pause aria-hidden /> : <Play aria-hidden />}
                {automation.status === "ACTIVE" ? "Pause" : "Activate"}
              </DropdownMenuItem>
            )}
            {canManage && (
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

      <DeleteAutomationDialog automationId={automation.id} name={automation.name} open={deleteOpen} onOpenChange={setDeleteOpen} />
      <ActivationProblemsDialog problems={problems} onOpenChange={(open) => !open && setProblems(null)} />
    </li>
  );
}
