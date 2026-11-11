// The providers list on /settings/providers. Server Component: it receives
// SAFE summaries only (no credentials) and hands plain values to the client
// pieces (buttons, dialogs).
import type { ReactNode } from "react";
import Link from "next/link";
import { CircleAlert, Gauge, Plus, Server, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { ProviderSummary } from "@/lib/email/provider-admin";
import { cn } from "@/lib/utils";
import { ProviderStatusBadge, ProviderTypeIcon, RelativeTime } from "./provider-bits";
import { ProviderRowActions } from "./provider-row-actions";
import { formatHint, providerLabel, suggestedTestFrom } from "./provider-rules";

export function AddProviderLink({ className }: { className?: string }) {
  return (
    <Link
      href="/settings/providers/new"
      className={cn(buttonVariants(), "bg-emerald-600 text-white hover:bg-emerald-700", className)}
    >
      <Plus aria-hidden />
      Add provider
    </Link>
  );
}

export function ProviderList({
  providers,
  userEmail,
  canManage,
}: {
  providers: ProviderSummary[];
  userEmail: string;
  canManage: boolean;
}) {
  // If the default is deleted, the oldest remaining provider takes over
  // (same rule as deleteProvider in provider-admin.ts).
  const oldestFirst = [...providers].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return (
    <ul className="flex flex-col gap-4">
      {providers.map((p) => {
        const nextDefault = p.isDefault ? (oldestFirst.find((o) => o.id !== p.id) ?? null) : null;
        const hintText = formatHint(p.hint);
        return (
          <li key={p.id} className="flex flex-col gap-4 rounded-xl border bg-white p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <ProviderTypeIcon type={p.type} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold break-words text-zinc-900">{p.name}</h2>
                  {p.isDefault && (
                    <span className="inline-flex h-5 items-center rounded-full bg-emerald-600 px-2 text-xs font-medium text-white">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-sm break-words text-zinc-500">
                  {providerLabel(p.type)}
                  {hintText && (
                    <>
                      {" · "}
                      <span className="font-mono text-[0.85em] text-zinc-600">{hintText}</span>
                    </>
                  )}
                </p>
              </div>
              <ProviderStatusBadge status={p.status} />
            </div>

            {p.status === "FAILED" && p.lastError && (
              <p className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{p.lastError}</span>
              </p>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <Meta label="Last tested">
                {p.lastTestedAt ? <RelativeTime iso={p.lastTestedAt.toISOString()} /> : "Never"}
              </Meta>
              <Meta label="Speed">{p.maxPerSecond.toLocaleString("en")}/s</Meta>
              <Meta label="Daily cap">{p.dailyLimit ? p.dailyLimit.toLocaleString("en") : "No cap"}</Meta>
              <Meta label="Senders">{p.senderCount.toLocaleString("en")}</Meta>
            </dl>

            <div className="border-t pt-4">
              <ProviderRowActions
                provider={{
                  id: p.id,
                  name: p.name,
                  type: p.type,
                  suggestedFrom: suggestedTestFrom(p.type, p.hint, userEmail),
                  isDefault: p.isDefault,
                  senderCount: p.senderCount,
                  nextDefaultName: nextDefault?.name ?? null,
                }}
                userEmail={userEmail}
                canManage={canManage}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900">{children}</dd>
    </div>
  );
}

/** Shown when the workspace has no providers yet. */
export function ProvidersEmptyState({ canManage }: { canManage: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center sm:py-20">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <Server className="size-7" aria-hidden />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-zinc-900">Connect your first provider</h2>
      <p className="mt-1.5 max-w-md text-sm text-zinc-500">
        MailFlow is free because your emails go out through your own email service: Gmail, Amazon SES, Resend and
        others. That also means there&apos;s no daily cap from us; only your provider&apos;s own limits apply.
      </p>
      <ul className="mt-5 flex flex-col gap-2 text-left text-sm text-zinc-600 sm:flex-row sm:gap-6">
        <li className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-emerald-600" aria-hidden />
          Credentials are stored encrypted
        </li>
        <li className="flex items-center gap-2">
          <Gauge className="size-4 text-emerald-600" aria-hidden />
          You set the sending speed
        </li>
      </ul>
      {canManage ? (
        <AddProviderLink className="mt-6" />
      ) : (
        <p className="mt-6 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
          Ask a workspace owner or admin to connect one.
        </p>
      )}
    </div>
  );
}
