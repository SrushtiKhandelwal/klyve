import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/dashboard/page-header";
import { EditProviderForm } from "@/components/settings/providers/edit-provider-form";
import { ProviderStatusBadge, RelativeTime } from "@/components/settings/providers/provider-bits";
import { WebhookCard } from "@/components/settings/providers/webhook-card";
import { providerLabel } from "@/components/settings/providers/provider-rules";
import { Skeleton } from "@/components/ui/skeleton";
import { getProviderForEdit } from "@/lib/email/provider-admin";
import { getWebhookSettings } from "@/lib/webhooks/admin";
import { requireActiveWorkspace } from "@/lib/workspace";
import { BackToProviders, ManagersOnlyNotice } from "../back-link";

export const metadata: Metadata = { title: "Edit sending provider" };

type Props = { params: Promise<{ providerId: string }> };

export default function EditProviderPage({ params }: Props) {
  return (
    <PageContainer>
      <BackToProviders />
      {/* params and the session are only known at request time, so this streams in. */}
      <Suspense fallback={<EditSkeleton />}>
        <EditProviderContent params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function EditProviderContent({ params }: Props) {
  const ws = await requireActiveWorkspace();
  const { providerId } = await params;

  // Filtered by ws.id: an id from another workspace is "not found", exactly
  // like an id that never existed. Secret fields are not included.
  const provider = await getProviderForEdit(ws.id, providerId);
  if (!provider) notFound();

  const canManage = ws.role === "OWNER" || ws.role === "ADMIN";
  // Only managers see the webhook URL: it contains a secret token.
  const webhook = canManage ? await getWebhookSettings(ws.id, provider.id) : null;

  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight break-words text-zinc-900 sm:text-3xl">
            {provider.name}
          </h1>
          <ProviderStatusBadge status={provider.status} />
        </div>
        <p className="text-sm text-zinc-500">
          {providerLabel(provider.type)}
          {provider.lastTestedAt && (
            <>
              {" · Last tested "}
              <RelativeTime iso={provider.lastTestedAt.toISOString()} />
            </>
          )}
          {provider.status === "FAILED" && provider.lastError && (
            <span className="mt-1 block break-words text-red-700">{provider.lastError}</span>
          )}
        </p>
      </header>

      {!canManage ? (
        <ManagersOnlyNotice action="edit sending providers" />
      ) : (
        <>
          {provider.credentialsUnreadable && (
            <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              We couldn&apos;t read the saved settings for this provider (the encryption key may have changed).
              Please enter all fields again, including the password or API key.
            </p>
          )}
          <EditProviderForm
            providerId={provider.id}
            type={provider.type}
            showDevPresets={process.env.NODE_ENV !== "production"}
            initial={{
              name: provider.name,
              maxPerSecond: String(provider.maxPerSecond),
              dailyLimit: provider.dailyLimit ? String(provider.dailyLimit) : "",
              // Non-secret values only (host, port, region...). See getProviderForEdit.
              values: provider.values,
            }}
          />
          {webhook && <WebhookCard providerId={provider.id} settings={webhook} />}
        </>
      )}
    </>
  );
}

function EditSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <Skeleton className="h-9 w-64 max-w-full" />
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}
