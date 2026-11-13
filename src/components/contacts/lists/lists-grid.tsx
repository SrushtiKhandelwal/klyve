import Link from "next/link";
import { Globe, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ListWithCounts } from "@/lib/contacts/lists";
import { CreateListButton } from "./list-form-dialog";
import { ListActionsMenu } from "./list-actions-menu";
import { formatCount, formatDate } from "./format";

/** The workspace's lists as cards (one column on phones, up to three on wide screens). */
export function ListsGrid({ lists }: { lists: ListWithCounts[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {lists.map((list) => (
        <li
          key={list.id}
          // `relative` lets the name's link stretch over the whole card (see below).
          className="relative flex min-w-0 flex-col rounded-xl border bg-white p-5 transition-shadow focus-within:ring-3 focus-within:ring-emerald-500/30 hover:shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ListChecks className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate font-semibold text-zinc-900">
                  <Link
                    href={`/contacts/lists/${list.id}`}
                    // The ::after box covers the card, so clicking anywhere opens the list.
                    className="outline-none after:absolute after:inset-0 after:rounded-xl"
                  >
                    {list.name}
                  </Link>
                </h2>
                {list.isPublic && <PublicBadge />}
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm break-words text-zinc-500">
                {list.description || <span className="text-zinc-400">No description</span>}
              </p>
            </div>
            {/* Sits above the stretched link so the menu stays clickable. */}
            <div className="relative z-10 -mt-1 -mr-2">
              <ListActionsMenu
                list={{
                  id: list.id,
                  name: list.name,
                  description: list.description,
                  isPublic: list.isPublic,
                  publicName: list.publicName,
                  publicDescription: list.publicDescription,
                }}
                totalMembers={list.totalMembers}
              />
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-zinc-50 px-3 py-2">
              <dt className="text-xs text-zinc-500">Members</dt>
              <dd className="text-lg font-semibold text-zinc-900 tabular-nums">
                {formatCount(list.totalMembers)}
              </dd>
            </div>
            <div className="rounded-lg bg-emerald-50/60 px-3 py-2">
              <dt className="text-xs text-emerald-700">Subscribed</dt>
              <dd className="text-lg font-semibold text-emerald-800 tabular-nums">
                {formatCount(list.subscribedMembers)}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-xs text-zinc-400">Created {formatDate(list.createdAt)}</p>
        </li>
      ))}
    </ul>
  );
}

/** Marks a list subscribers can choose in the preference centre. */
export function PublicBadge() {
  return (
    <Badge
      variant="outline"
      title="Shown in the preference centre: subscribers can join or leave it themselves"
      className="shrink-0 gap-1 border-sky-200 bg-sky-50 text-sky-700"
    >
      <Globe aria-hidden />
      Public
    </Badge>
  );
}

/** Shown when the workspace has no lists yet. */
export function ListsEmptyState() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center sm:py-20">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <ListChecks className="size-7" aria-hidden />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-zinc-900">Create your first list</h2>
      <p className="mt-1.5 max-w-md text-sm text-zinc-500">
        Lists group the people you email together, such as “Newsletter”, “Customers” or “Event
        guests”. A contact can be in as many lists as you like, and campaigns are sent to lists.
      </p>
      <CreateListButton className="mt-6" />
    </div>
  );
}
