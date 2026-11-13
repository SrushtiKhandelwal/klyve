import type { ReactNode } from "react";
import Link from "next/link";
import { MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

// Frame for the PUBLIC developer docs (/docs/...). No login check here, so
// the pages stay fully static and load instantly for anyone with the link.
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-white">
      <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur supports-backdrop-filter:bg-white/75">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-zinc-900">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <MailIcon className="size-3.5" aria-hidden />
              </span>
              {BRAND.name}
            </Link>
            <span className="text-zinc-300" aria-hidden>
              /
            </span>
            <Link href="/docs/api" className="truncate text-sm font-medium text-zinc-600 hover:text-zinc-900">
              API docs
            </Link>
          </div>
          <nav className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/settings/api" prefetch={false} />}>
              API keys
            </Button>
            <Button size="sm" nativeButton={false} render={<Link href="/dashboard" prefetch={false} />}>
              Dashboard
            </Button>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
