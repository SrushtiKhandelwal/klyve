"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, PencilRuler, Plus, Sparkles } from "lucide-react";
import { createAutomationAction } from "@/app/actions/automations";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * "Create automation": two clear choices.
 *  - Start from a recipe → the recipe gallery on /automations/new.
 *  - Start from scratch → creates a blank draft right away and opens the builder.
 */
export function CreateAutomationButton({ className, label = "Create automation" }: { className?: string; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function fromScratch() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createAutomationAction({});
        if (!result.ok) return setError(result.error);
        router.push(`/automations/${result.automationId}`);
      } catch {
        setError("Couldn't reach the server. Please try again.");
      }
    });
  }

  const choice =
    "flex w-full items-start gap-3 rounded-xl border bg-white p-4 text-left transition-colors outline-none hover:border-emerald-300 hover:bg-emerald-50/40 focus-visible:ring-3 focus-visible:ring-emerald-500/40";

  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setError(null);
          setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create an automation</DialogTitle>
            <DialogDescription>Emails that go out by themselves when something happens. How do you want to start?</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Link href="/automations/new" className={choice} onClick={() => setOpen(false)}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Sparkles className="size-4.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-zinc-900">Start from a recipe</span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  Ready-made welcome series, birthday emails, win-back and more. Recommended.
                </span>
              </span>
              <ChevronRight className="mt-2 size-4 shrink-0 text-zinc-400" aria-hidden />
            </Link>
            <button type="button" className={cn(choice, pending && "opacity-70")} onClick={fromScratch} disabled={pending}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
                {pending ? <Loader2 className="size-4.5 animate-spin" aria-hidden /> : <PencilRuler className="size-4.5" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-zinc-900">Start from scratch</span>
                <span className="mt-0.5 block text-xs text-zinc-500">One trigger and one email to begin with. Add steps as you like.</span>
              </span>
              <ChevronRight className="mt-2 size-4 shrink-0 text-zinc-400" aria-hidden />
            </button>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
