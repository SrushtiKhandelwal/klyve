import Link from "next/link";
import { Link2OffIcon } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";

// Shown when a password-reset link is missing, wrong, expired or already used.
// Works in both Server and Client Components (no hooks, no server-only code).
export function InvalidResetLink() {
  return (
    <div role="alert" className="grid gap-5 text-center">
      {/* Amber = "something's wrong", drawn bare like every other icon. */}
      <Glyph icon={Link2OffIcon} size="xl" tone="current" strokeWidth={1.5} className="mx-auto text-amber-600" />
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
