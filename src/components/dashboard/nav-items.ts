import {
  ClipboardList,
  FileText,
  House,
  Megaphone,
  Send,
  Settings,
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
export type NavGroup = "Audience" | "Messages";
export type NavItem = { href: string; label: string; icon: LucideIcon; group?: NavGroup };

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/contacts", label: "Contacts", icon: Users, group: "Audience" },
  { href: "/forms", label: "Forms", icon: ClipboardList, group: "Audience" },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone, group: "Messages" },
  { href: "/templates", label: "Templates", icon: FileText, group: "Messages" },
  { href: "/automations", label: "Automations", icon: Workflow, group: "Messages" },
  { href: "/transactional", label: "Transactional", icon: Send, group: "Messages" },
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
