import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangleIcon, CheckCircle2Icon, ClockIcon, MailIcon, ServerIcon, ShieldCheckIcon } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { AddSenderDialog } from "@/components/settings/senders/add-sender-dialog";
import { SenderActions } from "@/components/settings/senders/sender-actions";
import type { ProviderOption, SenderView } from "@/components/settings/senders/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PROVIDERS, type ProviderTypeValue } from "@/lib/email/provider-configs";
import { listProviderChoices, listSenders } from "@/lib/email/senders";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Senders" };

export default function SendersPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Senders"
        description="The “From” addresses your campaigns are sent from. Each one must be verified before you can use it."
      />

      {/* Everything below depends on the logged-in user's workspace, so it streams in. */}
      <Suspense fallback={<SendersSkeleton />}>
        <SendersSection />
      </Suspense>

      <div className="flex gap-3 rounded-xl border bg-white p-5 text-sm text-zinc-600">
        <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div className="grid gap-1">
          <p className="font-medium text-zinc-900">Why we verify every sender</p>
          <p>
            Anyone could type any address, so we email a code to it first. Only someone who can read that inbox
            can confirm it. This stops people from sending campaigns that pretend to come from someone else.
          </p>
        </div>
      </div>
    </PageContainer>
  );
}

async function SendersSection() {
  const ws = await requireActiveWorkspace();
  const canManage = ws.role === "OWNER" || ws.role === "ADMIN";
  const [senders, providerRows] = await Promise.all([listSenders(ws.id), listProviderChoices(ws.id)]);

  const providers: ProviderOption[] = providerRows.map((p) => ({
    id: p.id,
    name: p.name,
    typeLabel: PROVIDERS[p.type as ProviderTypeValue]?.label ?? p.type,
    isDefault: p.isDefault,
  }));

  const views: SenderView[] = senders.map((s) => ({
    id: s.id,
    email: s.email,
    name: s.name,
    replyTo: s.replyTo,
    provider: s.provider ? { id: s.provider.id, name: s.provider.name } : null,
    verified: !!s.verifiedAt,
    verificationSentAt: s.verificationSentAt?.toISOString() ?? null,
    codeActive: s.codeActive,
  }));

  return (
    <>
      {providers.length === 0 && <NoProviderCallout canManage={canManage} />}

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-zinc-900">Your senders</h2>
            <p className="text-sm text-zinc-500">
              {canManage
                ? "Add the addresses you want to send from."
                : "Only owners and admins can add or change senders. You can still enter verification codes."}
            </p>
          </div>
          {canManage && providers.length > 0 && <AddSenderDialog providers={providers} />}
        </div>

        {views.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <MailIcon className="size-6" />
            </span>
            <h3 className="mt-4 font-semibold text-zinc-900">No senders yet</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              Add an address like news@yourcompany.com. We&apos;ll send it a code to confirm it&apos;s yours.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {views.map((sender) => (
              <SenderRow key={sender.id} sender={sender} providers={providers} canManage={canManage} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SenderRow({
  sender,
  providers,
  canManage,
}: {
  sender: SenderView;
  providers: ProviderOption[];
  canManage: boolean;
}) {
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid min-w-0 gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="min-w-0 text-sm font-medium break-all text-zinc-900">
            {sender.name} <span className="font-normal text-zinc-500">&lt;{sender.email}&gt;</span>
          </p>
          <StatusBadge verified={sender.verified} />
        </div>
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
          <span className="break-all">Reply-to: {sender.replyTo ?? "same as From"}</span>
          {sender.provider ? (
            <span>Sends through: {sender.provider.name}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <AlertTriangleIcon className="size-3" />
              No provider chosen
            </span>
          )}
        </p>
      </div>
      <SenderActions sender={sender} providers={providers} canManage={canManage} />
    </li>
  );
}

function StatusBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
      <CheckCircle2Icon className="size-3" />
      Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset">
      <ClockIcon className="size-3" />
      Pending
    </span>
  );
}

function NoProviderCallout({ canManage }: { canManage: boolean }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 sm:flex-row sm:items-center">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-600">
        <ServerIcon className="size-5" />
      </span>
      <div className="grid flex-1 gap-0.5">
        <p className="font-medium text-zinc-900">Connect a sending provider first</p>
        <p className="text-sm text-zinc-600">
          Senders send through your own email service (Amazon SES, Resend, SMTP…). We also use it to email the
          verification code.
        </p>
      </div>
      {canManage && (
        <Button render={<Link href="/settings/providers" />} nativeButton={false}>
          Add a provider
        </Button>
      )}
    </div>
  );
}

function SendersSkeleton() {
  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b px-5 py-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b px-5 py-4 last:border-0">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
