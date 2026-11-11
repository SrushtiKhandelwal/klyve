import Link from "next/link";
import { LinkIcon } from "lucide-react";

// Shown when a password-reset link is missing, wrong, expired or already used.
// Works in both Server and Client Components (no hooks, no server-only code).
export function InvalidResetLink() {
  return (
    <div role="alert" className="grid gap-5 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <LinkIcon className="size-6" aria-hidden="true" />
      </div>
      <div className="grid gap-1">
        <p className="font-medium">This reset link doesn&apos;t work anymore</p>
        <p className="text-sm text-muted-foreground">
          Links expire after 1 hour and can only be used once. Request a new one and use the
          newest email we send you.
        </p>
      </div>
      <Link
        href="/forgot-password"
        className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
      >
        Request a new link
      </Link>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-emerald-700 hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
