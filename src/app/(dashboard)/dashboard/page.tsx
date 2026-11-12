import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Check, FileText, Send, Server, Users, type LucideIcon } from "lucide-react";
import { PageContainer } from "@/components/dashboard/page-header";
import { PerformanceOverview, PerformanceOverviewSkeleton } from "@/components/dashboard/performance-overview";
import {
  RecentCampaigns,
  RecentCampaignsHeader,
  RecentCampaignsSkeleton,
} from "@/components/dashboard/recent-campaigns";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Home" };

type StepKey = "provider" | "contacts" | "templates" | "campaign";

// `href` set = the feature exists, so the card becomes a link.
type Step = { key: StepKey; icon: LucideIcon; title: string; description: string; href?: string };

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

type DoneSteps = Record<StepKey, boolean>;

export default function DashboardPage() {
  return (
    <PageContainer>
      {/* The greeting needs the user's name, so it streams in. */}
      <Suspense fallback={<WelcomeSkeleton />}>
        <Welcome />
      </Suspense>

      <section aria-labelledby="getting-started" className="flex flex-col gap-4">
        <h2 id="getting-started" className="text-lg font-semibold text-zinc-900">
          Getting started
        </h2>
        {/* The cards show straight away; the "Done" ticks stream in. */}
        <Suspense fallback={<StepList />}>
          <GettingStarted />
        </Suspense>
      </section>

      <section aria-labelledby="performance" className="flex flex-col gap-4">
        <h2 id="performance" className="text-lg font-semibold text-zinc-900">
          Last 30 days
        </h2>
        {/* Reads the workspace (cookie), so it streams in. */}
        <Suspense fallback={<PerformanceOverviewSkeleton />}>
          <PerformanceOverview />
        </Suspense>
      </section>

      <section aria-labelledby="recent-campaigns" className="flex flex-col gap-4">
        <RecentCampaignsHeader />
        <Suspense fallback={<RecentCampaignsSkeleton />}>
          <RecentCampaigns />
        </Suspense>
      </section>
    </PageContainer>
  );
}

async function Welcome() {
  // Checks login + workspace itself (see the rule in ../layout.tsx).
  const [user, workspace] = await Promise.all([requireUser(), requireActiveWorkspace()]);
  const firstName = user.name.trim().split(/\s+/)[0] || "there";

  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
        Welcome, {firstName}
      </h1>
      <p className="text-sm text-zinc-500 sm:text-base">
        Here&apos;s how to get <span className="font-medium text-zinc-700">{workspace.name}</span>{" "}
        ready to send email.
      </p>
    </div>
  );
}

/** Works out which getting-started steps this workspace has already done. */
async function GettingStarted() {
  const ws = await requireActiveWorkspace();
  const workspaceId = ws.id;
  // "Is there at least one?" checks: findFirst stops at the first row.
  const [provider, contact, template, sent] = await Promise.all([
    db.sendingProvider.findFirst({ where: { workspaceId, status: "CONNECTED" }, select: { id: true } }),
    db.contact.findFirst({ where: { workspaceId }, select: { id: true } }),
    db.emailTemplate.findFirst({ where: { workspaceId }, select: { id: true } }),
    db.campaign.findFirst({ where: { workspaceId, status: "SENT" }, select: { id: true } }),
  ]);
  return (
    <StepList
      done={{ provider: !!provider, contacts: !!contact, templates: !!template, campaign: !!sent }}
    />
  );
}

/** The four cards. Without `done` (while loading) nothing is ticked yet. */
function StepList({ done }: { done?: DoneSteps }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2">
      {STEPS.map((step, index) => {
        const isDone = done?.[step.key] ?? false;
        const Icon = isDone ? Check : step.icon;
        return (
          <li
            key={step.key}
            className={cn(
              "relative flex gap-4 rounded-xl border bg-white p-5 shadow-xs",
              step.href && "transition-colors hover:border-emerald-300",
            )}
          >
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
                  {step.href ? (
                    // The stretched link makes the whole card clickable.
                    <Link href={step.href} className="after:absolute after:inset-0 hover:text-emerald-700">
                      {step.title}
                    </Link>
                  ) : (
                    step.title
                  )}
                </h3>
                {isDone && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
                    Done
                  </span>
                )}
                {!step.href && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-500">{step.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function WelcomeSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton className="h-8 w-56 sm:h-9" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  );
}
