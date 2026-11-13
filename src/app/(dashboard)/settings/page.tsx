import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { WorkspaceSettingsForm } from "@/components/settings/general/workspace-settings-form";
import type { TimeZoneOption } from "@/components/settings/general/time-zone-select";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/db";
import {
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  listTimeZones,
  normalizeDatePrefs,
  timeZoneLabel,
} from "@/lib/format-date";
import { ROLE_LABELS } from "@/lib/team/roles";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Settings" };

// Settings → General: the workspace's name, time zone and date/time formats.
export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="General" description="Your workspace's name, and how dates and times are shown to everyone in it." />

      <section aria-labelledby="workspace-heading" className="rounded-xl border bg-white">
        <div className="border-b px-5 py-4">
          <h2 id="workspace-heading" className="font-semibold text-zinc-900">
            Workspace
          </h2>
        </div>
        {/* Workspace details depend on the logged-in user, so they stream in. */}
        <Suspense fallback={<WorkspaceDetailsSkeleton />}>
          <WorkspaceDetails />
        </Suspense>
      </section>
    </PageContainer>
  );
}

// This is the pattern every data-showing page should follow: an async
// component inside <Suspense> that checks access itself, right next to the
// data, instead of relying on the layout.
async function WorkspaceDetails() {
  const workspace = await requireActiveWorkspace();
  const canEdit = workspace.role === "OWNER" || workspace.role === "ADMIN";

  const row = await db.workspace.findUnique({
    where: { id: workspace.id },
    select: { name: true, timezone: true, dateFormat: true, timeFormat: true },
  });
  const prefs = normalizeDatePrefs(row);
  const name = row?.name ?? workspace.name;

  const info = (
    <>
      <DetailRow label="Slug">
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.85em] break-all">{workspace.slug}</code>
      </DetailRow>
      <DetailRow label="Your role">{ROLE_LABELS[workspace.role]}</DetailRow>
    </>
  );

  if (!canEdit) {
    return (
      <div className="divide-y">
        <dl className="divide-y">
        <DetailRow label="Name">{name}</DetailRow>
        <DetailRow label="Time zone">{timeZoneLabel(prefs.timezone)}</DetailRow>
        <DetailRow label="Date format">
          {DATE_FORMAT_OPTIONS.find((o) => o.value === prefs.dateFormat)?.label}
        </DetailRow>
        <DetailRow label="Time format">
          {TIME_FORMAT_OPTIONS.find((o) => o.value === prefs.timeFormat)?.label}
        </DetailRow>
        {info}
        </dl>
        <p className="px-5 py-3 text-sm text-zinc-500">Only the workspace owner or an admin can change these settings.</p>
      </div>
    );
  }

  // Every zone the server knows, labelled with its current offset. The saved
  // zone is added if it's an older alias that isn't in the list.
  const now = new Date();
  const zones = listTimeZones();
  if (!zones.includes(prefs.timezone)) zones.unshift(prefs.timezone);
  const timeZones: TimeZoneOption[] = zones.map((zone) => ({ value: zone, label: timeZoneLabel(zone, now) }));

  return (
    <>
      <WorkspaceSettingsForm
        initial={{ name, timezone: prefs.timezone, dateFormat: prefs.dateFormat, timeFormat: prefs.timeFormat }}
        timeZones={timeZones}
      />
      <dl className="divide-y border-t">{info}</dl>
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
      <dt className="w-40 shrink-0 text-sm text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-zinc-900">{children}</dd>
    </div>
  );
}

function WorkspaceDetailsSkeleton() {
  return (
    <div className="divide-y">
      {["w-56", "w-64", "w-40", "w-40", "w-28"].map((width, i) => (
        <div key={i} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
          <Skeleton className="h-4 w-20 sm:w-40" />
          <Skeleton className={`h-8 ${width}`} />
        </div>
      ))}
    </div>
  );
}
