import Link from "next/link";
import { ArrowRight, Check, CircleCheck, FileText, Send, Server, Users, type LucideIcon } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { requireActiveWorkspace } from "@/lib/workspace";

// The "Getting started" checklist on the dashboard home. Once all four steps
// are done it shrinks to a single "You're all set" line, so it stops taking
// space on every visit. Render it inside <Suspense> (it reads the login cookie).

type StepKey = "provider" | "contacts" | "templates" | "campaign";

type Step = { key: StepKey; icon: LucideIcon; title: string; description: string; href: string };

const STEPS: Step[] = [
  {
    key: "provider",
    icon: Server,
    title: "Connect a sending provider",
    description: "Link Amazon SES, Resend, SMTP or another service you already use.",
    href: "/settings/providers",
  },
  {
    key: "contacts",
    icon: Users,
    title: "Import contacts",
    description: "Upload a CSV or add people by hand to build your first list.",
    href: "/contacts/import",
  },
  {
    key: "templates",
    icon: FileText,
    title: "Design a template",
    description: "Create a reusable email design with your logo and colours.",
    href: "/templates",
  },
  {
    key: "campaign",
    icon: Send,
    title: "Send your first campaign",
    description: "Pick a list, choose a template and hit send.",
    href: "/campaigns",
  },
];

/** Works out which steps this workspace has done, then shows the checklist (or "all set"). */
export async function GettingStarted() {
  // Checks login + workspace right next to the data; only THIS workspace's rows.
  const ws = await requireActiveWorkspace();
  const workspaceId = ws.id;
  // "Is there at least one?" checks: findFirst stops at the first row.
  const [provider, contact, template, sent] = await Promise.all([
    db.sendingProvider.findFirst({ where: { workspaceId, status: "CONNECTED" }, select: { id: true } }),
    db.contact.findFirst({ where: { workspaceId }, select: { id: true } }),
    db.emailTemplate.findFirst({ where: { workspaceId }, select: { id: true } }),
    db.campaign.findFirst({ where: { workspaceId, status: "SENT" }, select: { id: true } }),
  ]);
  const done: Record<StepKey, boolean> = {
    provider: !!provider,
    contacts: !!contact,
    templates: !!template,
    campaign: !!sent,
  };
  const doneCount = STEPS.filter((s) => done[s.key]).length;

  // Everything done: a small confirmation instead of four big cards.
  if (doneCount === STEPS.length) {
    return (
      <p className="flex items-center gap-3 rounded-xl border bg-white px-4 py-3 text-sm text-zinc-600 shadow-xs">
        <Glyph icon={CircleCheck} />
        <span>
          <span className="font-medium text-zinc-900">You&apos;re all set.</span> All four getting-started steps are
          done, so your workspace is ready to send.
        </span>
      </p>
    );
  }

  // One card with a numbered list: each row is a step, ticked off once done.
  return (
    <section aria-labelledby="getting-started" className="overflow-hidden rounded-xl border bg-white shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 pt-5 pb-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="getting-started" className="text-lg font-semibold text-zinc-900">
            Getting started
          </h2>
          <p className="text-sm text-zinc-500">Four steps and your workspace is ready to send.</p>
        </div>
        <ProgressLabel doneCount={doneCount} total={STEPS.length} />
      </div>
      <ol className="divide-y border-t">
        {STEPS.map((step, index) => (
          <StepRow key={step.key} step={step} index={index} isDone={done[step.key]} />
        ))}
      </ol>
    </section>
  );
}

/** "2 of 4 done" with a thin progress bar. */
function ProgressLabel({ doneCount, total }: { doneCount: number; total: number }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-zinc-500">
      <span className="tabular-nums">
        {doneCount} of {total} done
      </span>
      <span
        role="progressbar"
        aria-label="Getting started progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={doneCount}
        className="h-1.5 w-28 overflow-hidden rounded-full bg-zinc-100"
      >
        <span
          className="block h-full rounded-full bg-emerald-500"
          style={{ width: `${(doneCount / total) * 100}%` }}
        />
      </span>
    </div>
  );
}

/**
 * One step: its number (a tick once done), the step's icon, the words, and an
 * arrow. The whole row is clickable.
 */
function StepRow({ step, index, isDone }: { step: Step; index: number; isDone: boolean }) {
  return (
    <li className="group relative flex items-center gap-4 px-5 py-4 transition-colors hover:bg-zinc-50/80">
      <span className="flex w-6 shrink-0 justify-center" aria-hidden>
        {isDone ? (
          <Glyph icon={Check} strokeWidth={2.5} />
        ) : (
          <span className="text-sm font-semibold text-zinc-400 tabular-nums">{String(index + 1).padStart(2, "0")}</span>
        )}
      </span>
      <Glyph icon={step.icon} tone={isDone ? "muted" : "brand"} className="hidden sm:block" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className={cn("text-sm font-medium", isDone ? "text-zinc-500" : "text-zinc-900")}>
          {/* The stretched link makes the whole row clickable. */}
          <Link
            href={step.href}
            className="outline-none group-hover:text-emerald-700 after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-emerald-500/40 focus-visible:after:ring-inset"
          >
            {step.title}
          </Link>
          {isDone && <span className="sr-only"> (done)</span>}
        </h3>
        <p className="text-sm text-zinc-500">{step.description}</p>
      </div>
      {isDone ? (
        <span className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-700 sm:flex" aria-hidden>
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Done
        </span>
      ) : (
        <ArrowRight
          aria-hidden
          className="size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-600"
        />
      )}
    </li>
  );
}

/**
 * Shown while the checklist loads. Deliberately small: most visits are from
 * workspaces that finished the checklist long ago and only see one line.
 */
export function GettingStartedSkeleton() {
  return <Skeleton className="h-12 w-full rounded-xl" />;
}
