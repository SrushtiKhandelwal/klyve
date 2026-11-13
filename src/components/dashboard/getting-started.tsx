import Link from "next/link";
import { Check, CircleCheck, FileText, Send, Server, Users, type LucideIcon } from "lucide-react";
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
      <p className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
        <CircleCheck className="size-5 shrink-0 text-emerald-600" aria-hidden />
        <span>
          <span className="font-medium">You&apos;re all set.</span> All four getting-started steps are done, so your
          workspace is ready to send.
        </span>
      </p>
    );
  }

  return (
    <section aria-labelledby="getting-started" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="getting-started" className="text-lg font-semibold text-zinc-900">
          Getting started
        </h2>
        <ProgressLabel doneCount={doneCount} total={STEPS.length} />
      </div>
      <ol className="grid gap-4 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <StepCard key={step.key} step={step} index={index} isDone={done[step.key]} />
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
        className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200"
      >
        <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(doneCount / total) * 100}%` }} />
      </span>
    </div>
  );
}

function StepCard({ step, index, isDone }: { step: Step; index: number; isDone: boolean }) {
  const Icon = isDone ? Check : step.icon;
  return (
    <li className="relative flex gap-4 rounded-xl border bg-white p-5 shadow-xs transition-colors hover:border-emerald-300">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          isDone ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-600",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-medium text-zinc-900">
            <span className="text-zinc-400">{index + 1}.</span>{" "}
            {/* The stretched link makes the whole card clickable. */}
            <Link href={step.href} className="after:absolute after:inset-0 hover:text-emerald-700">
              {step.title}
            </Link>
          </h3>
          {isDone && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
              Done
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-500">{step.description}</p>
      </div>
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
