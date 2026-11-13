import Link from "next/link";
import { ClipboardList, Megaphone, Upload, Workflow, type LucideIcon } from "lucide-react";

// Four shortcuts on the dashboard home. Plain links with no private data, so
// they render instantly (no <Suspense> needed). Opening a link never creates
// anything: each page has its own "Create" button.

type QuickAction = { href: string; icon: LucideIcon; title: string; description: string };

const ACTIONS: QuickAction[] = [
  { href: "/campaigns/new", icon: Megaphone, title: "New campaign", description: "Email a list or segment." },
  { href: "/automations/new", icon: Workflow, title: "New automation", description: "Start from a ready recipe." },
  { href: "/contacts/import", icon: Upload, title: "Import contacts", description: "Upload a CSV file." },
  { href: "/forms", icon: ClipboardList, title: "Create form", description: "Collect new sign-ups." },
];

export function QuickActions() {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {ACTIONS.map((action) => (
        <li
          key={action.href}
          className="group relative flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-xs transition-colors hover:border-emerald-300 sm:flex-row sm:items-center"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
            <action.icon className="size-[18px]" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            {/* The stretched link makes the whole card clickable. */}
            <Link
              href={action.href}
              className="text-sm font-medium text-zinc-900 outline-none after:absolute after:inset-0 after:rounded-xl group-hover:text-emerald-700 focus-visible:after:ring-3 focus-visible:after:ring-emerald-500/40"
            >
              {action.title}
            </Link>
            <span className="text-xs text-zinc-500">{action.description}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
