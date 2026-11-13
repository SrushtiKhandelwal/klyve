import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { InvalidResetLink } from "@/components/auth/invalid-reset-link";

export const metadata: Metadata = {
  title: "Choose a new password",
  // The reset token is in this page's URL. "no-referrer" stops the browser
  // from sending that URL to any other website the page links to or loads.
  referrer: "no-referrer",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Users arrive here from the email link. Better Auth checks the token first,
// then sends them on as ?token=... (valid) or ?error=INVALID_TOKEN (bad,
// expired or used).
export default function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Card className="gap-6 py-8 shadow-lg shadow-zinc-900/5">
      <CardHeader className="px-6 text-center sm:px-8">
        <CardTitle>
          <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        </CardTitle>
        <CardDescription>You&apos;ll be logged out on all your other devices.</CardDescription>
      </CardHeader>
      <CardContent className="px-6 sm:px-8">
        {/* Reading the URL happens at request time, so (Next.js rule) it
            must sit inside <Suspense>. The card above shows instantly. */}
        <Suspense fallback={<FormSkeleton />}>
          <ResetPasswordContent searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function ResetPasswordContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const hasError = params.error !== undefined;

  if (!token || hasError) return <InvalidResetLink />;
  return <ResetPasswordForm token={token} />;
}

function FormSkeleton() {
  return (
    <div className="grid gap-5" aria-hidden="true">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
