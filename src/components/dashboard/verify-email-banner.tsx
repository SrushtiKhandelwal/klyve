import { headers } from "next/headers";
import { MailWarningIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { ResendVerificationButton } from "@/components/auth/resend-verification-button";

/**
 * "Please verify your email address" strip for the top of the dashboard.
 * Renders nothing when nobody is logged in or the email is already verified.
 *
 * It reads the session (request headers), so (Next.js rule) it MUST be
 * rendered inside <Suspense>, for example in the dashboard layout:
 *
 *   <Suspense fallback={null}>
 *     <VerifyEmailBanner />
 *   </Suspense>
 */
export async function VerifyEmailBanner() {
  // We read the session directly (not getCurrentUser) because we need the
  // `emailVerified` flag, which getCurrentUser doesn't return.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.emailVerified) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
    >
      <MailWarningIcon className="size-4 shrink-0 text-amber-700" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        Please verify your email address. We sent a link to{" "}
        <span className="font-medium break-all">{session.user.email}</span>.
      </p>
      <ResendVerificationButton
        email={session.user.email}
        className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
      />
    </div>
  );
}
