"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// The menu inside Settings, grouped like Brevo's:
// - desktop (lg+): a list down the left side of the settings pages
// - phones and tablets: one compact "Settings · Profile ▾" box at the top
//   that opens the same list
// Every page keeps its own URL, so old links and bookmarks still work.

type SettingsLink = { href: string; label: string };
type SettingsGroup = { label: string; links: SettingsLink[] };

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Your account",
    links: [
      { href: "/settings/profile", label: "Profile" },
      { href: "/settings/security", label: "Security" },
    ],
  },
  {
    label: "Workspace",
    links: [
      { href: "/settings", label: "General" },
      { href: "/settings/team", label: "Team" },
      { href: "/settings/brand", label: "Brand" },
      { href: "/settings/ai", label: "AI" },
    ],
  },
  {
    label: "Sending",
    links: [
      { href: "/settings/providers", label: "Sending providers" },
      { href: "/settings/senders", label: "Senders" },
      { href: "/settings/domains", label: "Domains" },
      { href: "/settings/deliverability", label: "Deliverability" },
      { href: "/settings/tracking", label: "Link tracking" },
      { href: "/settings/compliance", label: "Compliance" },
    ],
  },
  {
    label: "Developers",
    links: [{ href: "/settings/api", label: "API keys" }],
  },
];

/** "/settings" (General) only matches itself; the others also match pages inside them. */
function isCurrent(pathname: string, href: string) {
  if (href === "/settings") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsNav() {
  // usePathname is why this is a Client Component: it needs the browser URL.
  const pathname = usePathname();
  return <SettingsMenu pathname={pathname} />;
}

/** Same menu with nothing highlighted (Suspense fallback while the URL is unknown). */
export function SettingsNavFallback() {
  return <SettingsMenu pathname={null} />;
}

function SettingsMenu({ pathname }: { pathname: string | null }) {
  let current: { group: string; label: string } | undefined;
  for (const group of SETTINGS_GROUPS) {
    const link = pathname ? group.links.find((l) => isCurrent(pathname, l.href)) : undefined;
    if (link) current = { group: group.label, label: link.label };
  }

  return (
    <>
      {/* Desktop: the full list on the left. */}
      <nav aria-label="Settings" className="hidden lg:block">
        <p className="px-3 text-base font-semibold tracking-tight text-zinc-900">Settings</p>
        <GroupedLinks pathname={pathname} className="mt-5" />
      </nav>

      {/*
        Phones and tablets: a box showing where you are, which opens the list.
        `key` makes it close again after you pick a page.
      */}
      <details key={pathname ?? ""} className="group/settings rounded-xl border bg-white shadow-xs lg:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-col">
            <span className="text-xs text-zinc-500">
              Settings
              {current && <span aria-hidden> · {current.group}</span>}
            </span>
            <span className="truncate text-sm font-semibold text-zinc-900">{current?.label ?? "All settings"}</span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-medium text-zinc-500">
            <span className="group-open/settings:hidden">Change</span>
            <span className="hidden group-open/settings:inline">Close</span>
            <ChevronDown aria-hidden className="size-4 text-zinc-400 transition-transform group-open/settings:rotate-180" />
          </span>
        </summary>
        <nav aria-label="Settings" className="border-t px-2 pt-3 pb-2">
          <GroupedLinks pathname={pathname} onWhite />
        </nav>
      </details>
    </>
  );
}

function GroupedLinks({
  pathname,
  className,
  onWhite = false,
}: {
  pathname: string | null;
  className?: string;
  /** Inside the white phone/tablet box rather than on the grey page. */
  onWhite?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.label}>
          <p aria-hidden className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            {group.label}
          </p>
          <ul aria-label={group.label} className="flex flex-col gap-0.5">
            {group.links.map((link) => {
              const active = pathname !== null && isCurrent(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center rounded-full px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40",
                      active
                        ? // On the grey page a touch more green, so it reads like the sidebar's highlight.
                          cn("font-semibold text-emerald-900", onWhite ? "bg-emerald-50" : "bg-emerald-100/60")
                        : cn("text-zinc-600 hover:text-zinc-900", onWhite ? "hover:bg-zinc-100" : "hover:bg-zinc-200/50"),
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
