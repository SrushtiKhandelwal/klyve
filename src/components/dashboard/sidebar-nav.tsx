"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, type NavItem } from "./nav-items";
import { useSidebar } from "./sidebar-shell";

/** True when `pathname` is the link itself or a page inside it. */
function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The sidebar links, with the current section highlighted in green. */
export function SidebarNav() {
  // usePathname is why this is a Client Component: it needs the browser URL.
  const pathname = usePathname();
  return <NavList activeHref={NAV_ITEMS.find((i) => isActive(pathname, i.href))?.href} />;
}

/**
 * Same links with nothing highlighted. Used as the <Suspense> fallback for
 * SidebarNav: on future pages with dynamic URLs (e.g. /contacts/[id]) the
 * pathname isn't known while prerendering, so the nav briefly shows this.
 */
export function SidebarNavFallback() {
  return <NavList />;
}

function NavList({ activeHref }: { activeHref?: string }) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <li key={item.href}>
          <NavLink item={item} active={item.href === activeHref} />
        </li>
      ))}
    </ul>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { closeMobile } = useSidebar();
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      // Close the phone drawer after picking a page.
      onClick={closeMobile}
      aria-current={active ? "page" : undefined}
      // Shown as a tooltip when the sidebar is icons-only.
      title={item.label}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40",
        "md:max-lg:justify-center md:max-lg:px-0",
        active
          ? "bg-emerald-50 text-emerald-700"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      )}
    >
      <Icon
        className={cn("size-5 shrink-0", active ? "text-emerald-600" : "text-zinc-400")}
      />
      <span className="truncate md:max-lg:sr-only">{item.label}</span>
    </Link>
  );
}
