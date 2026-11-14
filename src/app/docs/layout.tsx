import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { KlyveMark, KlyveWordmark } from "@/components/brand/logo";

// Frame for the PUBLIC developer docs (/docs/...). No login check here, so
// the pages stay fully static and load instantly for anyone with the link.
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-white">
      <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur supports-backdrop-filter:bg-white/75">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-lg leading-none text-zinc-900">
              <KlyveMark size={28} />
              <KlyveWordmark />
              <span className="sr-only">, home</span>
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
