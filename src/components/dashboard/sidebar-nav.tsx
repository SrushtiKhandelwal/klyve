"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, groupNavItems, type NavItem } from "./nav-items";
import { useSidebar } from "./sidebar-shell";

/** True when `pathname` is the link itself or a page inside it. */
function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Worked out once: the list never changes while the app runs.
const SECTIONS = groupNavItems(NAV_ITEMS);

/** The sidebar links, with the current section highlighted in green. */
export function SidebarNav() {
  // usePathname is why this is a Client Component: it needs the browser URL.
  const pathname = usePathname();
  return <NavList activeHref={NAV_ITEMS.find((i) => isActive(pathname, i.href))?.href} />;
}

/**
 * Same links with nothing highlighted. Used as the <Suspense> fallback for
 * SidebarNav: on pages with dynamic URLs (e.g. /contacts/[id]) the pathname
 * isn't known while prerendering, so the nav briefly shows this.
 */
export function SidebarNavFallback() {
  return <NavList />;
}

function NavList({ activeHref }: { activeHref?: string }) {
  return (
    // min-h-full + mt-auto (below) pins the last, unlabelled group
    // (Settings) to the bottom of the sidebar, just above the user menu.
    <div className="flex min-h-full flex-col gap-6 md:max-lg:gap-3">
      {SECTIONS.map((section, index) => {
        const pinToBottom = index === SECTIONS.length - 1 && !section.group && index > 0;
        return (
          <div key={section.items[0].href} className={cn(pinToBottom && "mt-auto")}>
            {/* Icons-only sidebar (tablet): a thin line instead of the heading. */}
            {index > 0 && <div aria-hidden className="mx-2 mb-3 hidden border-t md:max-lg:block" />}
            {section.group && (
              <p
                aria-hidden
                className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase md:max-lg:hidden"
              >
                {section.group}
              </p>
            )}
            <ul aria-label={section.group} className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={item.href === activeHref} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
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
        "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40",
        "md:max-lg:justify-center md:max-lg:px-0",
        active
          ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/10 ring-inset"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-[18px] shrink-0", active ? "text-emerald-600" : "text-zinc-400")}
      />
      <span className="truncate md:max-lg:sr-only">{item.label}</span>
    </Link>
  );
}
