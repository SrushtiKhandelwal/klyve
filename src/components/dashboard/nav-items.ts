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
export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/forms", label: "Forms", icon: ClipboardList },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/transactional", label: "Transactional", icon: Send },
  { href: "/settings", label: "Settings", icon: Settings },
];
