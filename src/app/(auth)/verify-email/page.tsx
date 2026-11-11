import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { CircleCheckIcon, MailIcon, TriangleAlertIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ResendVerificationButton } from "@/components/auth/resend-verification-button";

export const metadata: Metadata = {
  title: "Verify your email",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Where the "Verify your email" link lands. Better Auth checks the token at
// /api/auth/verify-email, marks the email verified, logs the user in, then
// sends them here. If the token was bad it adds ?error=TOKEN_EXPIRED (or
// INVALID_TOKEN / USER_NOT_FOUND).
export default function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Card className="py-8 shadow-sm">
      <CardContent className="px-6 sm:px-8">
        {/* Reads the URL and the session at request time, so (Next.js rule)
            it must sit inside <Suspense>. */}
        <Suspense fallback={<StatusSkeleton />}>
          <VerifyEmailStatus searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function VerifyEmailStatus({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;

  // We decide "success" from the database (via the session), not from the
  // URL, so typing /verify-email into the address bar doesn't claim success.
  if (user?.emailVerified) {
    return (
      <Status
        tone="success"
        title="Your email is verified"
        text={`Thanks! ${user.email} is confirmed.`}
      >
        <PrimaryLink href="/dashboard">Go to your dashboard</PrimaryLink>
      </Status>
    );
  }

  if (error) {
    const expired = error === "TOKEN_EXPIRED";
    return (
      <Status
        tone="error"
        title={expired ? "This link has expired" : "This link doesn't work"}
        text={
          expired
            ? "Verification links are valid for 24 hours. Get a new one below."
            : "It may be incomplete or out of date. Get a new one and use the newest email."
        }
      >
        <ResendOrLogin email={user?.email} />
      </Status>
    );
  }

  // No error, but not verified (yet): someone opened this page directly.
  return (
    <Status
      tone="info"
      title="Check your inbox"
      text="Open the link in the email we sent you to verify your address."
    >
      <ResendOrLogin email={user?.email} />
    </Status>
  );
}

/** Logged in: a resend button. Logged out: log in first (the dashboard has a resend button). */
function ResendOrLogin({ email }: { email?: string }) {
  if (email) {
    return (
      <ResendVerificationButton
        email={email}
        variant="default"
        size="lg"
        label="Send a new link"
        className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700"
      />
    );
  }
  return (
    <>
      <PrimaryLink href="/login">Log in to get a new link</PrimaryLink>
      <p className="text-sm text-muted-foreground">
        After logging in, use &quot;Resend email&quot; at the top of your dashboard.
      </p>
    </>
  );
}

const TONES = {
  success: { icon: CircleCheckIcon, circle: "bg-emerald-100 text-emerald-700" },
  error: { icon: TriangleAlertIcon, circle: "bg-amber-100 text-amber-700" },
  info: { icon: MailIcon, circle: "bg-emerald-100 text-emerald-700" },
} as const;

function Status({
  tone,
  title,
  text,
  children,
}: {
  tone: keyof typeof TONES;
  title: string;
  text: string;
  children: ReactNode;
}) {
  const { icon: Icon, circle } = TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className="grid gap-5 text-center">
      <div className={`mx-auto flex size-12 items-center justify-center rounded-full ${circle}`}>
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm break-words text-muted-foreground">{text}</p>
      </div>
      {children}
    </div>
  );
}

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
    >
      {children}
    </Link>
  );
}

function StatusSkeleton() {
  return (
    <div className="grid justify-items-center gap-5" aria-hidden="true">
      <Skeleton className="size-12 rounded-full" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
