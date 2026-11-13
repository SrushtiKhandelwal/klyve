import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenIcon, KeyRoundIcon, ShieldAlertIcon } from "lucide-react";
import { CreateKeyDialog } from "@/components/api-keys/create-key-dialog";
import { KeyActions } from "@/components/api-keys/key-actions";
import { RelativeTime } from "@/components/campaigns/local-time";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listApiKeys, type ApiKeySummary } from "@/lib/api/keys";
import { getVerifiedSenders } from "@/lib/email/senders";
import { getCurrentUser } from "@/lib/session";
import { TRANSACTIONAL_LIMITS } from "@/lib/transactional/schema";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "API keys" };

// Settings → API keys. The frame is static; the list depends on the logged-in
// user's workspace, so it streams in inside <Suspense>.
export default function ApiKeysPage() {
  return (
    <PageContainer>
      <PageHeader
        title="API keys"
        description="Let your own app send emails (receipts, password resets…) and manage contacts through the Klyve API."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex gap-3 rounded-xl border bg-white p-5 text-sm text-zinc-600">
          <BookOpenIcon className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          <div className="grid gap-1">
            <p className="font-medium text-zinc-900">What keys are for</p>
            <p>
              Your server sends a key with each request so we know it&apos;s you. Every email sent with a key shows up
              under Transactional.
            </p>
            <Link href="/docs/api" className="mt-1 w-fit font-medium text-emerald-700 underline-offset-2 hover:underline">
              Read the API docs →
            </Link>
          </div>
        </div>
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-5 text-sm text-amber-950">
          <ShieldAlertIcon className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="grid gap-1">
            <p className="font-medium">Keep keys secret</p>
            <p>
              Never put them in website code or a public repo. Anyone with a key can send email as you. If one leaks,
              revoke it here and create a new one.
            </p>
          </div>
        </div>
      </div>

      <Suspense fallback={<KeysSkeleton />}>
        <KeysSection />
      </Suspense>
    </PageContainer>
  );
}

async function KeysSection() {
  const ws = await requireActiveWorkspace();
  const canManage = ws.role === "OWNER" || ws.role === "ADMIN";
  const [keys, senders, user] = await Promise.all([listApiKeys(ws.id), getVerifiedSenders(ws.id), getCurrentUser()]);
  const activeCount = keys.filter((k) => !k.revokedAt).length;
  const atLimit = activeCount >= TRANSACTIONAL_LIMITS.keysPerWorkspace;
  const firstSender = senders[0];

  return (
    <section className="overflow-hidden rounded-xl border bg-white" aria-labelledby="keys-title">
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="keys-title" className="font-semibold text-zinc-900">
            Your keys
          </h2>
          <p className="text-sm text-zinc-500">
            {canManage
              ? atLimit
                ? `You've reached ${TRANSACTIONAL_LIMITS.keysPerWorkspace} active keys. Revoke one you no longer use to create another.`
                : `Up to ${TRANSACTIONAL_LIMITS.keysPerWorkspace} active keys per workspace. Use one per app.`
              : "Only owners and admins can create, rename or revoke keys."}
          </p>
        </div>
        {/* Always rendered in the same place, so the "new key" dialog stays open when the list refreshes. */}
        {canManage && (
          <CreateKeyDialog
            disabled={atLimit}
            exampleFrom={firstSender ? `${firstSender.name} <${firstSender.email}>` : null}
            exampleTo={user?.email ?? "you@example.com"}
          />
        )}
      </div>

      {keys.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <KeyRoundIcon className="size-6" aria-hidden />
          </span>
          <h3 className="mt-4 font-semibold text-zinc-900">No API keys yet</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            {canManage
              ? "Create a key to send your first email from code. It takes a minute, and the docs have copy-and-paste examples."
              : "Ask a workspace owner or admin to create one for your app."}
          </p>
          <Link href="/docs/api#quick-start" className={`${buttonVariants({ variant: "outline" })} mt-5`}>
            <BookOpenIcon aria-hidden />
            See the quick start
          </Link>
        </div>
      ) : (
        <ul className="divide-y">
          {keys.map((k) => (
            <KeyRow key={k.id} apiKey={k} canManage={canManage} />
          ))}
        </ul>
      )}
    </section>
  );
}

function KeyRow({ apiKey: k, canManage }: { apiKey: ApiKeySummary; canManage: boolean }) {
  const revoked = k.revokedAt !== null;
  return (
    <li className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${revoked ? "bg-zinc-50/60" : ""}`}>
      <div className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className={`min-w-0 font-medium break-words ${revoked ? "text-zinc-500" : "text-zinc-900"}`}>{k.name}</p>
          {revoked ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-zinc-500/20 ring-inset">
              Revoked
            </span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
              Active
            </span>
          )}
          <code className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700" title="The start of the key">
            {k.prefix}…
          </code>
        </div>
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
          <span>
            Created {k.createdByName ? <>by {k.createdByName} </> : null}
            <RelativeTime iso={k.createdAt.toISOString()} />
          </span>
          <span>
            {k.lastUsedAt ? (
              <>
                Last used <RelativeTime iso={k.lastUsedAt.toISOString()} />
              </>
            ) : (
              "Never used"
            )}
          </span>
          <span>
            {k.emailsLast30Days.toLocaleString("en")} email{k.emailsLast30Days === 1 ? "" : "s"} in the last 30 days
          </span>
          {k.revokedAt && (
            <span>
              Revoked <RelativeTime iso={k.revokedAt.toISOString()} />
            </span>
          )}
        </p>
      </div>
      {canManage && (
        <KeyActions apiKey={{ id: k.id, name: k.name, prefix: k.prefix, revoked }} />
      )}
    </li>
  );
}

function KeysSkeleton() {
  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b px-5 py-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2 border-b px-5 py-4 last:border-0">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-80 max-w-full" />
        </div>
      ))}
    </div>
  );
}
