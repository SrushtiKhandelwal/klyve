import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { UsageMeter } from "@/components/settings/ai/usage-meter";
import { Skeleton } from "@/components/ui/skeleton";
import { getAiConfig } from "@/lib/ai/config";
import { aiFeatureLabel } from "@/lib/ai/feature-names";
import { getAiUsageOverview } from "@/lib/ai/usage";
import { formatDateTime } from "@/lib/format-date";
import { requireUser } from "@/lib/session";
import { getWorkspaceDatePrefs } from "@/lib/workspace-prefs";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "AI" };

// Settings → AI: is AI set up, which model, and how much of the limits this
// workspace (and you) used. Every member can see it. No secrets are shown:
// the page only says WHETHER a key is set, never the key.

export default function AiSettingsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="AI"
        description="Write campaigns, subject lines and segments faster. AI makes a first draft; you always check it before anything is sent."
      />
      <Suspense fallback={<AiSettingsSkeleton />}>
        <AiSettingsContent />
      </Suspense>
    </PageContainer>
  );
}

async function AiSettingsContent() {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const [usage, prefs] = await Promise.all([getAiUsageOverview(ws.id, user.id), getWorkspaceDatePrefs(ws.id)]);
  // Read after the session lookups above, so it's read per request (never baked into a build).
  const config = getAiConfig();
  const configured = config.apiKey !== "";

  return (
    <div className="flex flex-col gap-6">
      {/* Set up or not */}
      <section className="rounded-xl border bg-white p-5" aria-labelledby="ai-status-title">
        <div className="flex items-start gap-3">
          {configured ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          )}
          <div className="grid min-w-0 gap-1">
            <h2 id="ai-status-title" className="font-semibold text-zinc-900">
              {configured ? "AI is set up" : "AI isn't set up on this server yet"}
            </h2>
            {configured ? (
              <p className="text-sm text-zinc-600">
                Using <span className="font-medium text-zinc-900">{config.model}</span> from Groq. Look for the{" "}
                <Sparkles className="inline size-3.5 text-emerald-600" aria-label="sparkles" /> buttons on Campaigns, in the email
                editor, on new segments and new automations, and on campaign reports.
              </p>
            ) : (
              <p className="text-sm text-zinc-600">
                The AI buttons show a short note until the person who runs Klyve adds a free Groq API key (from
                console.groq.com) as <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">GROQ_API_KEY</code> in
                the server&apos;s <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">.env</code> file and restarts it.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Limits */}
      <section className="grid gap-6 rounded-xl border bg-white p-5 sm:grid-cols-2" aria-label="Usage limits">
        <UsageMeter
          label="This workspace, this month"
          used={usage.month.used}
          limit={usage.month.limit}
          note={
            usage.month.used >= usage.month.limit
              ? `All requests used. They reset on ${usage.month.resetsOn}.`
              : `Resets on ${usage.month.resetsOn}.`
          }
        />
        <UsageMeter
          label="You, today"
          used={usage.today.used}
          limit={usage.today.limit}
          note={usage.today.used >= usage.today.limit ? "All your requests for today are used. They reset at midnight." : "Resets at midnight."}
        />
        <p className="text-xs text-zinc-500 sm:col-span-2">
          Each click on an AI button is one request, whether it works or not. Days and months follow your workspace&apos;s
          time zone ({usage.timezone}).
        </p>
      </section>

      {/* By feature */}
      <section className="overflow-hidden rounded-xl border bg-white" aria-labelledby="ai-features-title">
        <h2 id="ai-features-title" className="border-b px-5 py-4 font-semibold text-zinc-900">
          This month by feature
        </h2>
        {usage.byFeature.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500">No AI requests this month yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Feature</th>
                  <th className="px-5 py-2 text-right font-medium">Requests</th>
                  <th className="px-5 py-2 text-right font-medium">Failed</th>
                  <th className="hidden px-5 py-2 text-right font-medium sm:table-cell">Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {usage.byFeature.map((f) => (
                  <tr key={f.feature}>
                    <td className="px-5 py-2.5 text-zinc-900">{aiFeatureLabel(f.feature)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{f.requests.toLocaleString("en-US")}</td>
                    <td className="px-5 py-2.5 text-right text-zinc-500 tabular-nums">{f.failed.toLocaleString("en-US")}</td>
                    <td className="hidden px-5 py-2.5 text-right text-zinc-500 tabular-nums sm:table-cell">{f.tokens.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent requests */}
      <section className="overflow-hidden rounded-xl border bg-white" aria-labelledby="ai-recent-title">
        <h2 id="ai-recent-title" className="border-b px-5 py-4 font-semibold text-zinc-900">
          Last 20 requests
        </h2>
        {usage.recent.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500">Nothing yet. Requests show up here as your team uses the AI buttons.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Feature</th>
                  <th className="px-5 py-2 font-medium">Who</th>
                  <th className="px-5 py-2 font-medium">When</th>
                  <th className="px-5 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {usage.recent.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2.5 whitespace-nowrap text-zinc-900">{aiFeatureLabel(r.feature)}</td>
                    <td className="max-w-48 truncate px-5 py-2.5 text-zinc-600">{r.who}</td>
                    <td className="px-5 py-2.5 whitespace-nowrap text-zinc-600">{formatDateTime(r.createdAt, prefs)}</td>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      {r.ok ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="size-3.5" aria-hidden /> Worked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-700">
                          <XCircle className="size-3.5" aria-hidden /> Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Privacy */}
      <section className="flex gap-3 rounded-xl border bg-white p-5 text-sm text-zinc-600">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
        <div className="grid gap-1">
          <p className="font-medium text-zinc-900">What the AI sees</p>
          <p>
            Only what you type into an AI box, the text of the block or email you&apos;re working on, the names of your
            fields, lists and campaigns, and a campaign&apos;s totals. Never your contacts&apos; emails or names. The AI
            never sends anything and never adds links: you check every draft before it goes out.
          </p>
        </div>
      </section>
    </div>
  );
}

function AiSettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
