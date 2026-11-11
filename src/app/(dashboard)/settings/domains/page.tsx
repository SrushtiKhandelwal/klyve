import { Suspense } from "react";
import type { Metadata } from "next";
import { GlobeIcon, InfoIcon } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { AddDomainForm } from "@/components/settings/domains/add-domain-form";
import { DomainCard, type DomainView } from "@/components/settings/domains/domain-card";
import { isFreeMailDomain } from "@/components/settings/domains/free-mail";
import { Skeleton } from "@/components/ui/skeleton";
import { requireActiveWorkspace } from "@/lib/workspace";
import { getDomainSuggestions, getProviderDnsHints, listDomains } from "./data";

export const metadata: Metadata = { title: "Domains" };

export default function DomainsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Domains"
        description="Check that your domain's DNS records let inboxes trust your email."
      />

      <WhyThisMatters />

      {/* Depends on the logged-in user's workspace, so it streams in. */}
      <Suspense fallback={<DomainsSkeleton />}>
        <DomainsSection />
      </Suspense>
    </PageContainer>
  );
}

async function DomainsSection() {
  const ws = await requireActiveWorkspace();
  const canManage = ws.role === "OWNER" || ws.role === "ADMIN";
  const [domains, hints] = await Promise.all([listDomains(ws.id), getProviderDnsHints(ws.id)]);
  const suggestions = canManage ? await getDomainSuggestions(ws.id, domains.map((d) => d.domain)) : [];

  const views: DomainView[] = domains.map((d) => ({
    id: d.id,
    domain: d.domain,
    dkimSelectors: d.dkimSelectors,
    selectorHints: hints.selectorHints,
    lastResult: d.lastResult,
    lastCheckedAt: d.lastCheckedAt?.toISOString() ?? null,
    freeMail: isFreeMailDomain(d.domain),
  }));

  return (
    <>
      {canManage && (
        <section className="rounded-xl border bg-white">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold text-zinc-900">Add a domain</h2>
            <p className="text-sm text-zinc-500">The part after the @ in your sender addresses, e.g. acme.com.</p>
          </div>
          <div className="px-5 py-4">
            <AddDomainForm suggestions={suggestions} />
          </div>
        </section>
      )}

      {views.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <GlobeIcon className="size-6" />
          </span>
          <h3 className="mt-4 font-semibold text-zinc-900">No domains yet</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            {canManage
              ? "Add the domain you send from and we'll check its SPF, DKIM and DMARC records."
              : "An owner or admin can add your sending domain here."}
          </p>
        </div>
      ) : (
        views.map((d) => <DomainCard key={d.id} domain={d} canManage={canManage} />)
      )}
    </>
  );
}

function WhyThisMatters() {
  return (
    <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 text-sm text-zinc-700">
      <InfoIcon className="mt-0.5 size-5 shrink-0 text-emerald-600" />
      <div className="grid gap-2">
        <p className="font-medium text-zinc-900">Why this matters</p>
        <p>
          Since 2024, Gmail and Yahoo only accept bulk email (5,000+ a day to them) from senders that:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Pass <strong>SPF or DKIM</strong> for the From domain (DKIM is the most reliable).
          </li>
          <li>
            Publish a <strong>DMARC</strong> record (p=none is enough to start).
          </li>
          <li>
            Offer <strong>one-click unsubscribe</strong> in every marketing email.
          </li>
          <li>
            Keep the <strong>spam complaint rate under 0.3%</strong> (ideally under 0.1%).
          </li>
        </ul>
        <p className="text-xs text-zinc-500">
          Even below that volume, these records make it much more likely your email reaches the inbox.
        </p>
      </div>
    </div>
  );
}

function DomainsSkeleton() {
  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b px-5 py-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="px-5 py-4">
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}
