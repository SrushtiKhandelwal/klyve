import { Suspense } from "react";
import type { Metadata } from "next";
import { Cake, HeartHandshake, PartyPopper, Workflow } from "lucide-react";
import { AutomationRow, type AutomationRowData } from "@/components/automations/automation-row";
import { CreateAutomationButton } from "@/components/automations/create-automation-button";
import { triggerParts } from "@/components/automations/describe";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { AUTOMATION_LIMITS, getAutomationLookups, listAutomations } from "@/lib/automations/queries";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Automations" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

// The page frame is static. Everything that depends on the user loads inside
// <Suspense>, so it streams in.
export default function AutomationsPage() {
  return (
    <PageContainer>
      <Suspense fallback={<AutomationsSkeleton />}>
        <AutomationsContent />
      </Suspense>
    </PageContainer>
  );
}

async function AutomationsContent() {
  // Checks login + workspace right next to the data (see ../layout.tsx).
  const ws = await requireActiveWorkspace();
  // Both filtered by workspace: other workspaces' automations never appear.
  const [automations, lookups] = await Promise.all([listAutomations(ws), getAutomationLookups(ws)]);

  if (automations.length === 0) {
    return (
      <>
        <Header showButton={false} />
        <AutomationsEmpty />
      </>
    );
  }

  const rows: AutomationRowData[] = automations.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    triggerType: a.trigger.type,
    triggerParts: triggerParts(a.trigger, lookups),
    stepCount: a.stepCount,
    activeCount: a.activeCount,
    completedCount: a.completedCount,
    createdAt: a.createdAt.toISOString(),
    createdLabel: dateFormat.format(a.createdAt),
  }));
  const canManage = ws.role === "OWNER" || ws.role === "ADMIN";
  const atLimit = automations.length >= AUTOMATION_LIMITS.maxPerWorkspace;

  return (
    <>
      <Header showButton={!atLimit} />
      {atLimit && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-600/15">
          You&apos;ve reached the limit of {AUTOMATION_LIMITS.maxPerWorkspace} automations. Delete one you no longer need to
          create another.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <AutomationRow key={row.id} automation={row} canManage={canManage} />
        ))}
      </ul>
      {!canManage && (
        <p className="text-xs text-zinc-500">Only workspace owners and admins can turn automations on or off, or delete them.</p>
      )}
    </>
  );
}

function Header({ showButton }: { showButton: boolean }) {
  return (
    <PageHeader
      title="Automations"
      description="Emails that send themselves when something happens."
      actions={showButton && <CreateAutomationButton />}
    />
  );
}

const IDEAS = [
  { icon: PartyPopper, title: "Welcome series", text: "Say hello the moment someone joins, then follow up a few days later." },
  { icon: Cake, title: "Birthday emails", text: "A little gift or greeting every year, on the day (or a few days before)." },
  { icon: HeartHandshake, title: "Win-back", text: "Reach out to people who stopped opening, before they forget you." },
];

function AutomationsEmpty() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center sm:py-16">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <Workflow className="size-7" aria-hidden />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-zinc-900">Put your emails on autopilot</h2>
      <p className="mt-1.5 max-w-md text-sm text-zinc-500">
        An automation waits for something to happen, like someone joining a list, and then sends the right emails at the
        right time, on its own. Set it up once and it keeps working.
      </p>
      <span className="mt-4 inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/15">
        Free on Klyve. Paid on most other tools.
      </span>
      <ul className="mt-8 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
        {IDEAS.map((idea) => (
          <li key={idea.title} className="flex gap-3 rounded-xl border bg-zinc-50/60 p-4">
            <idea.icon className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900">{idea.title}</p>
              <p className="mt-1 text-xs text-zinc-500">{idea.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <CreateAutomationButton className="mt-8" label="Create your first automation" />
    </div>
  );
}

function AutomationsSkeleton() {
  return (
    <>
      <PageHeader title="Automations" description="Emails that send themselves when something happens." />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border bg-white p-4">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
