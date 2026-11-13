import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { describeDevice } from "@/components/settings/security/device-name";
import { SessionsList, type SessionRow } from "@/components/settings/security/sessions-list";
import { TwoFactorCard } from "@/components/settings/security/two-factor-card";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Security" };

// Settings → Security: two-step login, and the devices you're logged in on.
// Both are about YOUR account, so they look the same in every workspace.
export default function SecurityPage() {
  return (
    <PageContainer>
      <PageHeader title="Security" description="Keep your account safe: two-step login and the devices you're logged in on." />

      <Section title="Two-step login">
        <Suspense fallback={<RowsSkeleton rows={1} />}>
          <TwoFactorSection />
        </Suspense>
      </Section>

      <Section title="Where you're logged in" description="Every browser or device with a live login to your account.">
        <Suspense fallback={<RowsSkeleton rows={2} />}>
          <SessionsSection />
        </Suspense>
      </Section>
    </PageContainer>
  );
}

/** The logged-in user's session (Better Auth), or off to /login. */
async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session;
}

async function TwoFactorSection() {
  const { user } = await requireSession();
  // Read from the database, not the session, so it's right straight after a change.
  const row = await db.user.findUnique({ where: { id: user.id }, select: { twoFactorEnabled: true } });
  return <TwoFactorCard enabled={row?.twoFactorEnabled === true} />;
}

async function SessionsSection() {
  const { user, session: current } = await requireSession();
  // Straight from the database (only this user's live sessions). We never
  // send the secret session tokens to the browser, only the ids.
  const rows = await db.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, ipAddress: true, userAgent: true, createdAt: true, updatedAt: true },
  });

  const sessions: SessionRow[] = rows
    .map((s) => ({
      id: s.id,
      device: describeDevice(s.userAgent),
      ipAddress: s.ipAddress,
      lastActive: s.updatedAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      current: s.id === current.id,
    }))
    // This device first.
    .sort((a, b) => Number(b.current) - Number(a.current));

  return <SessionsList sessions={sessions} />;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold text-zinc-900">{title}</h2>
        {description && <p className="text-sm text-zinc-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 px-5 py-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
      ))}
    </div>
  );
}
