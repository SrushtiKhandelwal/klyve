import { Suspense } from "react";
import type { Metadata } from "next";
import { FileText, Send, Server, Users, type LucideIcon } from "lucide-react";
import { PageContainer } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Home" };

type Step = { icon: LucideIcon; title: string; description: string };

const STEPS: Step[] = [
  {
    icon: Server,
    title: "Connect a sending provider",
    description: "Link Amazon SES, Resend, SMTP or another service you already use.",
  },
  {
    icon: Users,
    title: "Import contacts",
    description: "Upload a CSV or add people by hand to build your first list.",
  },
  {
    icon: FileText,
    title: "Design a template",
    description: "Create a reusable email design with your logo and colours.",
  },
  {
    icon: Send,
    title: "Send your first campaign",
    description: "Pick a list, choose a template and hit send.",
  },
];

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
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex gap-4 rounded-xl border bg-white p-5 shadow-xs"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <step.icon className="size-5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="font-medium text-zinc-900">
                    <span className="text-zinc-400">{index + 1}.</span> {step.title}
                  </h3>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                    Coming soon
                  </span>
                </div>
                <p className="text-sm text-zinc-500">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
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

function WelcomeSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton className="h-8 w-56 sm:h-9" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  );
}
