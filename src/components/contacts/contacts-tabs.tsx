"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** The tabs along the top of every page in the Contacts section. */
export const CONTACTS_TABS = [
  { href: "/contacts", label: "All contacts", exact: true },
  { href: "/contacts/lists", label: "Lists" },
  { href: "/contacts/segments", label: "Segments" },
  { href: "/contacts/attributes", label: "Fields" },
  { href: "/contacts/import", label: "Import" },
  { href: "/contacts/suppression", label: "Suppression" },
] as const;

function isActive(pathname: string, tab: (typeof CONTACTS_TABS)[number]) {
  if ("exact" in tab && tab.exact) {
    // "All contacts" stays active on a single contact's page (/contacts/<id>),
    // but not on the other tabs' pages.
    if (pathname === tab.href) return true;
    const rest = CONTACTS_TABS.filter((t) => t.href !== tab.href);
    return pathname.startsWith(`${tab.href}/`) && !rest.some((t) => pathname.startsWith(t.href));
  }
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

export function ContactsTabs() {
  const pathname = usePathname();
  return <TabList pathname={pathname} />;
}

/** Same tabs with none highlighted (used while the URL isn't known yet). */
export function ContactsTabsFallback() {
  return <TabList pathname={null} />;
}

function TabList({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Contacts sections" className="-mb-px flex gap-1 overflow-x-auto">
      {CONTACTS_TABS.map((tab) => {
        const active = pathname !== null && isActive(pathname, tab);
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
