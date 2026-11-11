"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type SectionTab = { href: string; label: string };

/**
 * A row of tabs for a section (e.g. Settings). The first tab is the section's
 * home page and is only active on exactly that URL; the others are active on
 * their URL and anything under it.
 */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  const pathname = usePathname();
  return <TabRow tabs={tabs} label={label} pathname={pathname} />;
}

/** Same tabs with none highlighted (Suspense fallback while the URL is unknown). */
export function SectionTabsFallback({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  return <TabRow tabs={tabs} label={label} pathname={null} />;
}

function TabRow({
  tabs,
  label,
  pathname,
}: {
  tabs: SectionTab[];
  label: string;
  pathname: string | null;
}) {
  return (
    <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto">
      {tabs.map((tab, i) => {
        const active =
          pathname !== null &&
          (i === 0 ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40",
              active
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
