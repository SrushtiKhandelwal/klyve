import Link from "next/link";
import { ArrowUpRight, ClipboardList, Megaphone, Upload, Workflow, type LucideIcon } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";

// Four shortcuts on the dashboard home. Plain links with no private data, so
// they render instantly (no <Suspense> needed). Opening a link never creates
// anything: each page has its own "Create" button.
//
// Look: crisp white tiles, the icon sitting bare next to the title (no box
// behind it), and a small arrow that wakes up on hover.

type QuickAction = { href: string; icon: LucideIcon; title: string; description: string };

const ACTIONS: QuickAction[] = [
  { href: "/campaigns/new", icon: Megaphone, title: "New campaign", description: "Email a list or segment." },
  { href: "/automations/new", icon: Workflow, title: "New automation", description: "Start from a ready recipe." },
  { href: "/contacts/import", icon: Upload, title: "Import contacts", description: "Upload a CSV file." },
  { href: "/forms", icon: ClipboardList, title: "Create form", description: "Collect new sign-ups." },
];

export function QuickActions() {
  return (
    // Phones: one card with four rows. Wider: four separate tiles.
    <ul className="grid divide-y overflow-hidden rounded-xl border bg-white shadow-xs sm:grid-cols-2 sm:gap-3 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none lg:grid-cols-4">
      {ACTIONS.map((action) => (
        <li
          key={action.href}
          className="group relative flex flex-col gap-1 px-4 py-3.5 transition-[border-color,box-shadow,background-color] hover:bg-zinc-50/80 sm:gap-1.5 sm:rounded-xl sm:border sm:bg-white sm:shadow-xs sm:hover:border-emerald-300 sm:hover:bg-white sm:hover:shadow-sm"
        >
          <span className="flex items-center gap-2.5">
            <Glyph icon={action.icon} />
            {/* The stretched link makes the whole tile clickable. */}
            <Link
              href={action.href}
              className="min-w-0 truncate text-sm font-medium text-zinc-900 outline-none group-hover:text-emerald-700 after:absolute after:inset-0 sm:after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-emerald-500/40 focus-visible:after:ring-inset"
            >
              {action.title}
            </Link>
            <ArrowUpRight
              aria-hidden
              className="ml-auto size-4 shrink-0 text-zinc-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-emerald-600"
            />
          </span>
          <span className="pl-[30px] text-xs text-zinc-500">{action.description}</span>
        </li>
      ))}
    </ul>
  );
}
