"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, activeChildHref, groupNavItems, isWithin, type NavChild, type NavItem } from "./nav-items";
import { useSidebar } from "./sidebar-shell";

// The sidebar links. The page you're on gets a soft green highlight; a
// section with pages inside it (Contacts) opens up to show them, indented,
// while you're in that section.

// Worked out once: the list never changes while the app runs.
const SECTIONS = groupNavItems(NAV_ITEMS);

/** The sidebar links, with the current page highlighted. */
export function SidebarNav() {
  // usePathname is why this is a Client Component: it needs the browser URL.
  const pathname = usePathname();
  return <NavList pathname={pathname} />;
}

/**
 * Same links with nothing highlighted. Used as the <Suspense> fallback for
 * SidebarNav: on pages with dynamic URLs (e.g. /contacts/[id]) the pathname
 * isn't known while prerendering, so the nav briefly shows this.
 */
export function SidebarNavFallback() {
  return <NavList pathname={null} />;
}

// The last, unlabelled group (Settings) is pinned to the bottom of the
// sidebar, just above the user menu, and stays there even when the list
// above it is long enough to scroll (e.g. with Contacts opened up).
const LAST = SECTIONS[SECTIONS.length - 1];
const PINNED = SECTIONS.length > 1 && !LAST.group ? LAST : undefined;
const SCROLLING = PINNED ? SECTIONS.slice(0, -1) : SECTIONS;

function NavList({ pathname }: { pathname: string | null }) {
  const activeHref = pathname ? NAV_ITEMS.find((i) => isWithin(pathname, i.href))?.href : undefined;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Thin scrollbar: on short screens the list may need to scroll. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 [scrollbar-width:thin] md:max-lg:px-2">
        <div className="flex flex-col gap-6 md:max-lg:gap-3">
          {SCROLLING.map((section, index) => (
            <Section key={section.items[0].href} section={section} divider={index > 0} pathname={pathname} activeHref={activeHref} />
          ))}
        </div>
      </div>
      {PINNED && (
        <div className="border-t border-zinc-100 px-3 py-2 md:max-lg:px-2">
          <Section section={PINNED} divider={false} pathname={pathname} activeHref={activeHref} />
        </div>
      )}
    </div>
  );
}

function Section({
  section,
  divider,
  pathname,
  activeHref,
}: {
  section: (typeof SECTIONS)[number];
  divider: boolean;
  pathname: string | null;
  activeHref?: string;
}) {
  return (
    <div>
      {/* Icons-only sidebar (tablet): a thin line instead of the heading. */}
      {divider && <div aria-hidden className="mx-2 mb-3 hidden border-t md:max-lg:block" />}
      {section.group && (
        <p
          aria-hidden
          className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase md:max-lg:hidden"
        >
          {section.group}
        </p>
      )}
      <ul aria-label={section.group} className="flex flex-col gap-0.5">
        {section.items.map((item) => {
          const inSection = item.href === activeHref;
          const childHref = inSection && pathname && item.children ? activeChildHref(pathname, item.children) : undefined;
          return (
            <li key={item.href}>
              <NavLink item={item} inSection={inSection} isPage={inSection && !item.children} />
              {inSection && item.children && <ChildList parent={item} items={item.children} activeHref={childHref} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Shared look for every link: a soft rounded highlight on the current page. */
const linkBase =
  "group flex items-center gap-3 rounded-full px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40 md:max-lg:justify-center md:max-lg:px-0";
const linkCurrent = "bg-emerald-50 font-semibold text-emerald-900";
const linkIdle = "font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900";

/**
 * A top-level link. `inSection` = you're somewhere in this section (green
 * icon); `isPage` = this exact link is the current page (green highlight).
 * For a section with pages inside it, the highlight goes on the inner page.
 */
function NavLink({ item, inSection, isPage }: { item: NavItem; inSection: boolean; isPage: boolean }) {
  const { closeMobile } = useSidebar();
  return (
    <Link
      href={item.href}
      // Close the phone drawer after picking a page.
      onClick={closeMobile}
      aria-current={isPage ? "page" : undefined}
      // Shown as a tooltip when the sidebar is icons-only.
      title={item.label}
      className={cn(
        linkBase,
        "h-9",
        isPage ? linkCurrent : inSection ? "font-semibold text-zinc-900 hover:bg-zinc-100" : linkIdle,
      )}
    >
      <Glyph
        icon={item.icon}
        tone={inSection ? "brand" : "muted"}
        className={cn("size-[18px]", !inSection && "group-hover:text-zinc-500")}
      />
      <span className="truncate md:max-lg:sr-only">{item.label}</span>
      {item.children && (
        <ChevronDown
          aria-hidden
          className={cn(
            "ml-auto size-4 shrink-0 text-zinc-400 transition-transform md:max-lg:hidden",
            inSection ? "rotate-180" : "-rotate-90",
          )}
        />
      )}
    </Link>
  );
}

/**
 * The pages inside a section, indented under it with a thin guide line.
 * In the icons-only sidebar (tablet) each shows its own small icon instead.
 */
function ChildList({ parent, items, activeHref }: { parent: NavItem; items: NavChild[]; activeHref?: string }) {
  const { closeMobile } = useSidebar();
  return (
    <ul
      aria-label={`${parent.label} pages`}
      className="mt-0.5 mb-1 ml-5 flex flex-col gap-0.5 border-l border-zinc-200 pl-2.5 md:max-lg:mt-1 md:max-lg:ml-1.5 md:max-lg:pl-1"
    >
      {items.map((child) => {
        const active = child.href === activeHref;
        return (
          <li key={child.href}>
            <Link
              href={child.href}
              onClick={closeMobile}
              aria-current={active ? "page" : undefined}
              title={child.label}
              className={cn(linkBase, "h-8", active ? linkCurrent : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900")}
            >
              <Glyph icon={child.icon} size="sm" tone={active ? "brand" : "muted"} className="hidden md:max-lg:block" />
              <span className="truncate md:max-lg:sr-only">{child.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
