import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { safeNextPath } from "@/components/auth/safe-next";

export const metadata: Metadata = {
  title: "Two-step login",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Second login step for accounts with two-step login turned on. /login sends
// people here after a correct password (keeping any "?next=" page).
export default function TwoFactorPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Card className="gap-6 py-8 shadow-lg shadow-zinc-900/5">
      <CardHeader className="px-6 text-center sm:px-8">
        <CardTitle>
          <h1 className="text-2xl font-semibold tracking-tight">Two-step login</h1>
        </CardTitle>
        <CardDescription>Open your authenticator app and type the 6-digit code it shows for Klyve.</CardDescription>
      </CardHeader>
      <CardContent className="px-6 sm:px-8">
        {/* Reading the URL happens at request time, so it sits inside <Suspense>. */}
        <Suspense fallback={<FormSkeleton />}>
          <TwoFactorContent searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function TwoFactorContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <TwoFactorForm next={safeNextPath(params.next)} />;
}

function FormSkeleton() {
  return (
    <div className="grid gap-5" aria-hidden="true">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
