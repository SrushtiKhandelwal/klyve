"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Loader2, MoreHorizontal, Pause, Pencil, Play, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { duplicateFormAction, setFormStatusAction } from "@/app/actions/forms";
import { DeleteFormDialog } from "@/components/forms/delete-form-dialog";
import { FormStatusBadge } from "@/components/forms/form-status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type FormCardData = {
  id: string;
  name: string;
  publicId: string;
  status: "ACTIVE" | "PAUSED";
  submissionCount: number;
  /** ISO time. */
  updatedAt: string;
  /** "Edited 3 hours ago", worked out on the server. */
  updatedLabel: string;
  canDelete: boolean;
};

const numberFormat = new Intl.NumberFormat("en");

/**
 * One form on the /forms page: a small preview (rendered on the server and
 * passed in), name, status, sign-ups, and Edit / Duplicate / Pause / Delete.
 */
export function FormCard({ form, preview }: { form: FormCardData; preview: ReactNode }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const href = `/forms/${form.id}`;

  function duplicate() {
    startTransition(async () => {
      try {
        const result = await duplicateFormAction(form.id);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Form duplicated.", {
          action: { label: "Open", onClick: () => router.push(`/forms/${result.formId}`) },
        });
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  function toggleStatus() {
    const next = form.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    startTransition(async () => {
      try {
        const result = await setFormStatusAction(form.id, next);
        if (!result.ok) return void toast.error(result.error);
        toast.success(next === "PAUSED" ? "Form paused. It won't accept new sign-ups." : "Form is live again.");
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md">
      <Link
        href={href}
        className="block border-b outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40"
        aria-label={`Edit ${form.name}`}
      >
        {preview}
      </Link>
      <div className="flex items-start gap-2 p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h3 className="truncate font-medium text-zinc-900">
            <Link href={href} className="hover:underline">
              {form.name}
            </Link>
          </h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
            <FormStatusBadge status={form.status} />
            <span className="inline-flex items-center gap-1">
              <UserPlus className="size-3.5" aria-hidden />
              {numberFormat.format(form.submissionCount)} sign-up{form.submissionCount === 1 ? "" : "s"}
            </span>
          </div>
          <p className="truncate text-xs text-zinc-500">
            <time dateTime={form.updatedAt}>{form.updatedLabel}</time>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${form.name}`} disabled={pending} />}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => router.push(href)}>
              <Pencil aria-hidden />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(`/f/${form.publicId}`, "_blank", "noopener")}>
              <ExternalLink aria-hidden />
              View live form
            </DropdownMenuItem>
            <DropdownMenuItem onClick={duplicate}>
              <Copy aria-hidden />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggleStatus}>
              {form.status === "ACTIVE" ? <Pause aria-hidden /> : <Play aria-hidden />}
              {form.status === "ACTIVE" ? "Pause" : "Resume"}
            </DropdownMenuItem>
            {form.canDelete && (
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

      <DeleteFormDialog formId={form.id} name={form.name} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </article>
  );
}
