import {
  ChartColumn,
  ClipboardList,
  Contact,
  Filter,
  Images,
  FileText,
  House,
  ListChecks,
  Megaphone,
  Send,
  Settings,
  ShieldBan,
  Tags,
  Upload,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

// The sidebar links, kept in one list so adding a new section later is a
// one-line change. Both the real nav and its loading fallback read from here.
//
// `group` puts a small heading ("Audience", "Messages") above a run of links.
// Links next to each other with the same group are shown together, so keep
// them in order. No group = no heading.
//
// `children` are the pages inside a section (e.g. Contacts → Lists). They
// appear indented under the section while you're in it, like Brevo's sidebar.
// Their `icon` is only shown in the narrow icons-only sidebar (tablets), where
// there's no room for the words.
export type NavGroup = "Audience" | "Messages";
export type NavChild = { href: string; label: string; icon: LucideIcon };
export type NavItem = { href: string; label: string; icon: LucideIcon; group?: NavGroup; children?: NavChild[] };

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: House },
  {
    href: "/contacts",
    label: "Contacts",
    icon: Users,
    group: "Audience",
    children: [
      // The first child is the section's own page: it's also the one shown
      // as active on a single contact's page (/contacts/<id>).
      { href: "/contacts", label: "All contacts", icon: Contact },
      { href: "/contacts/lists", label: "Lists", icon: ListChecks },
      { href: "/contacts/segments", label: "Segments", icon: Filter },
      { href: "/contacts/attributes", label: "Fields", icon: Tags },
      { href: "/contacts/import", label: "Import", icon: Upload },
      { href: "/contacts/suppression", label: "Suppression", icon: ShieldBan },
    ],
  },
  { href: "/forms", label: "Forms", icon: ClipboardList, group: "Audience" },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone, group: "Messages" },
  { href: "/templates", label: "Templates", icon: FileText, group: "Messages" },
  { href: "/library", label: "Media", icon: Images, group: "Messages" },
  { href: "/automations", label: "Automations", icon: Workflow, group: "Messages" },
  { href: "/transactional", label: "Transactional", icon: Send, group: "Messages" },
  { href: "/statistics", label: "Statistics", icon: ChartColumn, group: "Messages" },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** NAV_ITEMS cut into runs that share a group, e.g. [Home], [Contacts, Forms], … */
export function groupNavItems(items: NavItem[] = NAV_ITEMS): { group?: NavGroup; items: NavItem[] }[] {
  const sections: { group?: NavGroup; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = sections[sections.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else sections.push({ group: item.group, items: [item] });
  }
  return sections;
}

/** True when `pathname` is the link itself or a page inside it. */
export function isWithin(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Which child page is open. The deepest match wins, so /contacts/lists/abc
 * picks "Lists" and not "All contacts"; a page that only matches the first
 * child (e.g. /contacts/abc, a single contact) falls back to it.
 */
export function activeChildHref(pathname: string, children: NavChild[]): string | undefined {
  let best: NavChild | undefined;
  for (const child of children) {
    if (isWithin(pathname, child.href) && (!best || child.href.length > best.href.length)) best = child;
  }
  return best?.href;
}
