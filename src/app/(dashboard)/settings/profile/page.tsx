import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { NameForm } from "@/components/settings/profile/name-form";
import { DeleteAccount } from "@/components/settings/profile/delete-account";
import { PasswordForm } from "@/components/settings/profile/password-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getDeletionPlan } from "@/lib/account-deletion";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Profile" };

// Settings → Profile: your own account (not the workspace): name, email,
// password, and deleting the account.
export default function ProfilePage() {
  return (
    <PageContainer>
      <PageHeader title="Profile" description="Your own account. These settings follow you into every workspace." />
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileSections />
      </Suspense>
    </PageContainer>
  );
}

async function ProfileSections() {
  const user = await requireUser();
  // Accounts made with a password have a "credential" login; only they can change it here.
  const [passwordLogin, deletionPlan] = await Promise.all([
    db.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
      select: { id: true },
    }),
    // What "Delete account" would delete or block (shown in its dialog).
    getDeletionPlan(user.id),
  ]);

  return (
    <>
      <Section title="Your details">
        <div className="grid gap-5">
          <NameForm initialName={user.name} />
          <div className="grid gap-1">
            <p className="text-sm font-medium text-zinc-900">Email</p>
            <p className="text-sm break-all text-zinc-700">{user.email}</p>
            <p className="text-xs text-zinc-500">You log in with this address. It can&apos;t be changed yet.</p>
          </div>
        </div>
      </Section>

      <Section
        title="Password"
        description="After changing it, you stay logged in here and every other device is logged out."
      >
        {passwordLogin ? (
          <PasswordForm />
        ) : (
          <p className="text-sm text-zinc-600">
            Your account doesn&apos;t use a password: you log in with Google. To add one, log out and use{" "}
            <span className="font-medium text-zinc-800">Forgot password?</span> on the login page.
          </p>
        )}
      </Section>

      <p className="text-sm text-zinc-500">
        Two-step login and the devices you&apos;re logged in on are under{" "}
        <Link href="/settings/security" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
          Security
        </Link>
        .
      </p>

      <Section title="Delete account">
        <DeleteAccount plan={deletionPlan} hasPassword={Boolean(passwordLogin)} />
      </Section>
    </>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-white">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold text-zinc-900">{title}</h2>
        {description && <p className="text-sm text-zinc-500">{description}</p>}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="grid gap-8">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border bg-white">
          <div className="border-b px-5 py-4">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="grid gap-3 px-5 py-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full max-w-sm" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}
