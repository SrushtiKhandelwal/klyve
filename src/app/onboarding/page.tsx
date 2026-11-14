import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CreateWorkspaceForm } from "@/components/onboarding/create-workspace-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/session";
import { getUserWorkspaces } from "@/lib/workspace";
import { NO_INDEX } from "@/lib/seo";

export const metadata: Metadata = {
  robots: NO_INDEX, // a step in the login flow: keep it out of search results
  title: "Create your workspace",
};

// The heading is static, so it shows instantly. The part that needs to know
// who is logged in sits inside <Suspense> (required with Cache Components,
// because reading the session reads request cookies).
export default function OnboardingPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Create your workspace</CardTitle>
          <CardDescription>
            A workspace holds your contacts, campaigns and templates. Later you
            can invite your team from Settings → Team. Been invited to someone
            else&apos;s workspace? Open the link in your invite email instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<FormSkeleton />}>
            <OnboardingForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

async function OnboardingForm() {
  // Logged-out visitors are sent to /login (the proxy usually catches them
  // first, but this is the real check).
  await requireUser();
  const workspaces = await getUserWorkspaces();

  return (
    <div className="flex flex-col gap-4">
      <CreateWorkspaceForm />
      {workspaces.length > 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Already have a workspace?{" "}
          <Link href="/dashboard" className="text-primary underline-offset-4 hover:underline">
            Back to dashboard
          </Link>
        </p>
      )}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
