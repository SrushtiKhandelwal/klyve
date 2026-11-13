import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CircleAlertIcon, InfoIcon } from "lucide-react";
import { LocalDateTime } from "@/components/campaigns/local-time";
import { PageContainer } from "@/components/dashboard/page-header";
import { CodeBlock } from "@/components/transactional/code";
import { ContentTabs } from "@/components/transactional/content-tabs";
import { TRANSACTIONAL_STATUS_META } from "@/components/transactional/status";
import { TransactionalStatusBadge } from "@/components/transactional/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getTransactionalDetail, type TransactionalDetail } from "@/lib/transactional/queries";
import { TRANSACTIONAL_LIMITS, type Address, type PublicEmail, type TransactionalStatusName } from "@/lib/transactional/schema";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Email details" };

// One transactional email in full: what happened to it, every detail, and its
// content. Unknown ids and other workspaces' emails are a 404 (see not-found.tsx).
export default function TransactionalEmailPage({ params }: PageProps<"/transactional/[id]">) {
  return (
    <PageContainer>
      <Link href="/transactional" className="-mb-4 flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeftIcon className="size-4" aria-hidden />
        All emails
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <EmailDetail params={params} />
      </Suspense>
    </PageContainer>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addressLabel(a: Address) {
  return a.name ? `${a.name} <${a.email}>` : a.email;
}

/** The email exactly as GET /api/v1/emails/{id} returns it (the detail has extra, dashboard-only fields). */
function toApiJson(e: TransactionalDetail): PublicEmail {
  return {
    id: e.id,
    object: e.object,
    status: e.status,
    to: e.to,
    from: e.from,
    replyTo: e.replyTo,
    subject: e.subject,
    templateId: e.templateId,
    tags: e.tags,
    metadata: e.metadata,
    error: e.error,
    createdAt: e.createdAt,
    sentAt: e.sentAt,
  };
}

/** Why there's no content to show, or null when there is some. */
function clearedNote(e: TransactionalDetail, status: TransactionalStatusName): string | null {
  if (e.html || e.text) return null;
  const ageDays = (Date.now() - new Date(e.createdAt).getTime()) / DAY_MS;
  if (ageDays >= TRANSACTIONAL_LIMITS.contentRetentionDays - 1) {
    return `The content was cleared ${TRANSACTIONAL_LIMITS.contentRetentionDays} days after sending, to protect your recipients' privacy. The log entry stays for ${TRANSACTIONAL_LIMITS.logRetentionDays} days.`;
  }
  if (status === "SUPPRESSED") {
    return "We didn't keep the content of this email, because the recipient's data was erased.";
  }
  return "This email has no stored content.";
}

async function EmailDetail({ params }: { params: PageProps<"/transactional/[id]">["params"] }) {
  const ws = await requireActiveWorkspace();
  const { id } = await params;
  // Filtered by workspace inside getTransactionalDetail: another workspace's id finds nothing.
  const email = await getTransactionalDetail(ws.id, id);
  if (!email) notFound();

  const status = email.status.toUpperCase() as TransactionalStatusName;
  const meta = TRANSACTIONAL_STATUS_META[status];
  const problem = status === "FAILED" || status === "BOUNCED" || status === "COMPLAINED" || status === "SUPPRESSED";

  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <TransactionalStatusBadge status={status} />
          {email.source === "dashboard" && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">Dashboard test</span>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight break-words text-zinc-900 sm:text-3xl">
          {email.subject || <span className="text-zinc-400 italic">No subject</span>}
        </h1>
        <p className="text-sm break-all text-zinc-500">To {addressLabel(email.to)}</p>
      </header>

      {/* What happened, in plain English. */}
      <section
        aria-label="Status"
        className={`flex gap-3 rounded-xl border p-5 text-sm ${problem ? "border-red-200 bg-red-50/50" : "bg-white"}`}
      >
        {problem ? (
          <CircleAlertIcon className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden />
        ) : (
          <InfoIcon className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
        )}
        <div className="grid min-w-0 gap-1.5">
          <p className="font-medium text-zinc-900">{meta.label}</p>
          <p className="text-zinc-600">{meta.meaning}</p>
          {email.error && (
            <p className="rounded-lg bg-white px-3 py-2 break-words text-zinc-800 ring-1 ring-zinc-200">
              <span className="font-medium">Reason: </span>
              {email.error}
            </p>
          )}
          {status === "QUEUED" && email.attempts > 0 && email.nextAttemptAt && (
            <p className="text-zinc-600">
              Tried {email.attempts} time{email.attempts === 1 ? "" : "s"} so far. Next try: <LocalDateTime iso={email.nextAttemptAt} />.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="details-title" className="rounded-xl border bg-white">
        <h2 id="details-title" className="border-b px-5 py-3.5 font-semibold text-zinc-900">
          Details
        </h2>
        <dl className="grid divide-y text-sm">
          <Row label="From">{addressLabel(email.from)}</Row>
          <Row label="To">{addressLabel(email.to)}</Row>
          <Row label="Reply-to">{email.replyTo ?? <Muted>Same as From</Muted>}</Row>
          <Row label="Subject">{email.subject || <Muted>None</Muted>}</Row>
          <Row label="Tags">
            {email.tags.length ? (
              <span className="flex flex-wrap gap-1">
                {email.tags.map((t) => (
                  <Link
                    key={t}
                    href={`/transactional?tag=${encodeURIComponent(t)}`}
                    className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700 hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    {t}
                  </Link>
                ))}
              </span>
            ) : (
              <Muted>None</Muted>
            )}
          </Row>
          <Row label="Sent with">
            {email.source === "dashboard" ? (
              "A test from the dashboard"
            ) : email.apiKey ? (
              <>
                {email.apiKey.name} <code className="font-mono text-xs text-zinc-500">{email.apiKey.prefix}…</code>
                {email.apiKey.revoked && <span className="ml-1 text-xs text-zinc-500">(revoked)</span>}
              </>
            ) : (
              <Muted>An API key that was deleted</Muted>
            )}
          </Row>
          <Row label="Template">
            {email.template ? (
              <Link href={`/templates/${email.template.id}`} className="text-emerald-700 hover:underline">
                {email.template.name}
              </Link>
            ) : email.templateId ? (
              <Muted>A template that was deleted</Muted>
            ) : (
              <Muted>None (HTML/text sent directly)</Muted>
            )}
          </Row>
          <Row label="Contact">
            {email.contactId ? (
              <Link href={`/contacts/${email.contactId}`} className="text-emerald-700 hover:underline">
                View contact
              </Link>
            ) : (
              <Muted>Not one of your contacts</Muted>
            )}
          </Row>
          {email.provider && <Row label="Provider">{email.provider.name}</Row>}
          {email.idempotencyKey && (
            <Row label="Idempotency key">
              <code className="font-mono text-xs">{email.idempotencyKey}</code>
            </Row>
          )}
          <Row label="Created">
            <LocalDateTime iso={email.createdAt} />
          </Row>
          <Row label="Sent">{email.sentAt ? <LocalDateTime iso={email.sentAt} /> : <Muted>Not sent</Muted>}</Row>
          {email.providerMessageId && (
            <Row label="Provider message id">
              <code className="font-mono text-xs break-all">{email.providerMessageId}</code>
            </Row>
          )}
          <Row label="Email id">
            <code className="font-mono text-xs break-all">{email.id}</code>
          </Row>
        </dl>
      </section>

      {email.metadata && (
        <section aria-labelledby="metadata-title" className="flex flex-col gap-2">
          <h2 id="metadata-title" className="font-semibold text-zinc-900">
            Metadata
          </h2>
          <CodeBlock code={JSON.stringify(email.metadata, null, 2)} title="Your data, as sent" what="Metadata" />
        </section>
      )}

      <section aria-labelledby="content-title" className="flex flex-col gap-2">
        <h2 id="content-title" className="font-semibold text-zinc-900">
          Content
        </h2>
        <ContentTabs
          html={email.html}
          text={email.text}
          json={JSON.stringify(toApiJson(email), null, 2)}
          clearedNote={clearedNote(email, status)}
        />
      </section>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 px-5 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words text-zinc-900">{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-zinc-400">{children}</span>;
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
