import type { ReactNode } from "react";
import Link from "next/link";
import { MailIcon } from "lucide-react";
import { BRAND } from "@/lib/brand";

// Shared frame for /login and /signup: logo on top, the page's card centered.
// The "(auth)" folder name is a route group: it groups these pages under one
// layout without adding "/auth" to the URL.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-emerald-50/50 px-4 py-12">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-xl font-semibold tracking-tight"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <MailIcon className="size-4" aria-hidden="true" />
        </span>
        {BRAND.name}
      </Link>
      <main className="w-full max-w-sm">{children}</main>
    </div>
  );
}
