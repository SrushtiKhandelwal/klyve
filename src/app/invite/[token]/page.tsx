import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/landing/brand-mark";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { findInviteByToken, looksLikeInviteToken } from "@/lib/team/invites";
import { ROLE_LABELS } from "@/lib/team/roles";
import { AcceptInviteButton, SwitchAccountButton } from "./invite-buttons";

export const metadata: Metadata = {
  title: "Join a workspace",
  // The invite token is in this page's URL: don't send it to other sites,
  // and keep the page out of search engines.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;

// Where the "Accept invite" button in a team invite email lands. Public page
// (outside the dashboard), so someone without an account can see who invited
// them, then sign up or log in and come straight back here to join.
export default function InvitePage({ params }: { params: Params }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12 sm:py-16">
      <BrandMark className="mb-8 text-xl" />
      <main id="main" className="w-full max-w-sm">
        <Card className="gap-6 py-8 shadow-lg shadow-zinc-900/5">
          {/* Reading the link and the session happens at request time, so it sits in <Suspense>. */}
          <Suspense fallback={<InviteSkeleton />}>
            <InviteContent params={params} />
          </Suspense>
        </Card>
      </main>
    </div>
  );
}

async function InviteContent({ params }: { params: Params }) {
  const { token } = await params;
  const invite = looksLikeInviteToken(token) ? await findInviteByToken(token) : ({ status: "not_found" } as const);
  const user = await getCurrentUser();
  const here = `/invite/${token}`;

  if (invite.status === "not_found") {
    return (
      <Message title="This invite link isn't valid">
        The link may be incomplete. Try opening it from the email again, or ask the person who invited you to send a
        new invite.
      </Message>
    );
  }

  const inviter = invite.inviterName?.trim() || "Someone";
  const workspace = invite.workspaceName;

  if (invite.status === "revoked") {
    return (
      <Message title="This invite was cancelled">
        Ask {inviter} to invite you again if you still need access to &quot;{workspace}&quot;.
      </Message>
    );
  }
  if (invite.status === "expired") {
    return (
      <Message title="This invite has expired">
        Invites work for 7 days. Ask {inviter} to send you a new one for &quot;{workspace}&quot;.
      </Message>
    );
  }

  const emailMatches = user !== null && user.email.toLowerCase() === invite.email.toLowerCase();

  if (invite.status === "accepted") {
    const isMember =
      user !== null &&
      (await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
        select: { id: true },
      })) !== null;
    if (isMember && emailMatches) {
      return (
        <Frame title={`You're in "${workspace}"`} description="You've already accepted this invite.">
          <AcceptInviteButton token={token} label="Open workspace" />
        </Frame>
      );
    }
    return <Message title="This invite has already been used">If you think that&apos;s wrong, ask {inviter} to invite you again.</Message>;
  }

  // A valid invite.
  const role = ROLE_LABELS[invite.role];
  const article = invite.role === "ADMIN" ? "an" : "a";
  const description = (
    <>
      {inviter} invited you to join as {article} {role.toLowerCase()}.
    </>
  );

  if (!user) {
    return (
      <Frame title={`Join "${workspace}"`} description={description}>
        <p className="text-sm text-zinc-600">
          This invite is for <strong className="font-medium break-all text-zinc-900">{invite.email}</strong>. Log in
          with that email, or create a free account with it.
        </p>
        <div className="grid gap-2">
          <Link
            href={`/login?next=${encodeURIComponent(here)}`}
            className={buttonVariants({ className: "h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700" })}
          >
            Log in to accept
          </Link>
          <Link
            href={`/signup?next=${encodeURIComponent(here)}`}
            className={buttonVariants({ variant: "outline", className: "h-10 w-full" })}
          >
            Create an account
          </Link>
        </div>
      </Frame>
    );
  }

  if (!emailMatches) {
    return (
      <Frame title={`Join "${workspace}"`} description={description}>
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
        >
          You&apos;re logged in as <strong className="font-medium break-all">{user.email}</strong>, but this invite is
          for <strong className="font-medium break-all">{invite.email}</strong>. Log in with that email to accept it.
        </div>
        <SwitchAccountButton next={here} />
        <Link href="/dashboard" className="text-center text-sm text-zinc-500 hover:text-zinc-900 hover:underline">
          Not now, back to my dashboard
        </Link>
      </Frame>
    );
  }

  return (
    <Frame title={`Join "${workspace}"`} description={description}>
      <p className="text-sm text-zinc-600">
        You&apos;ll be able to switch between your workspaces from the menu at the top of the sidebar.
      </p>
      <AcceptInviteButton token={token} label={`Join ${workspace}`} />
    </Frame>
  );
}

function Frame({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <>
      <CardHeader className="px-6 text-center sm:px-8">
        <CardTitle>
          <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 px-6 sm:px-8">{children}</CardContent>
    </>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Frame title={title} description={children}>
      <Link href="/dashboard" className={buttonVariants({ variant: "outline", className: "h-10 w-full" })}>
        Go to Klyve
      </Link>
    </Frame>
  );
}

function InviteSkeleton() {
  return (
    <div className="grid gap-4 px-6 sm:px-8" aria-hidden="true">
      <Skeleton className="mx-auto h-7 w-48" />
      <Skeleton className="mx-auto h-4 w-56" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
