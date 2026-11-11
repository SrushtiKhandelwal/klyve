import "server-only";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { contactDisplayName } from "@/lib/contacts/common";
import {
  countSegment,
  previewSegment,
  validateRulesForWorkspace,
  type CheckedSegmentRules,
} from "@/lib/segments/engine";
import { StatusPill } from "./status-pill";

const SHOW = 50;
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/**
 * "View contacts": the first 50 contacts matching the SAVED rules.
 * Only pass the workspaceId from requireActiveWorkspace().
 */
export async function SegmentContactsTable({ workspaceId, rules }: { workspaceId: string; rules: unknown }) {
  const checked = await validateRulesForWorkspace(workspaceId, rules);

  return (
    <section aria-labelledby="segment-contacts-heading" className="overflow-hidden rounded-xl border bg-white">
      {checked.ok ? (
        <Contacts workspaceId={workspaceId} checked={checked.checked} />
      ) : (
        <>
          <Heading />
          <p className="flex gap-2 px-5 py-6 text-sm text-amber-800">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            This segment needs fixing before it can be used: {checked.errors.join(" ")}
          </p>
        </>
      )}
    </section>
  );
}

async function Contacts({
  workspaceId,
  checked,
}: {
  workspaceId: string;
  checked: CheckedSegmentRules;
}) {
  const [count, contacts] = await Promise.all([
    countSegment(workspaceId, checked),
    previewSegment(workspaceId, checked, { limit: SHOW }),
  ]);

  return (
    <>
      <Heading
        note={
          count > SHOW
            ? `Showing the ${SHOW} newest of ${count.toLocaleString()} contacts.`
            : `${count.toLocaleString()} ${count === 1 ? "contact" : "contacts"} (saved version).`
        }
      />
      {contacts.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-zinc-500">No contacts match this segment yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-zinc-50/60 hover:bg-zinc-50/60">
              <TableHead className="pl-5">Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden pr-5 sm:table-cell">Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="max-w-0 pl-5 sm:max-w-none">
                  <Link href={`/contacts/${c.id}`} className="block truncate font-medium text-zinc-900 hover:text-emerald-700 hover:underline">
                    {contactDisplayName(c)}
                  </Link>
                  {(c.firstName || c.lastName) && <span className="block truncate text-xs text-zinc-500">{c.email}</span>}
                </TableCell>
                <TableCell className="w-px">
                  <StatusPill status={c.status} />
                </TableCell>
                <TableCell className="hidden w-px pr-5 text-zinc-500 sm:table-cell">
                  {dateFormat.format(c.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}

function Heading({ note }: { note?: string }) {
  return (
    <div className="border-b px-5 py-4">
      <h2 id="segment-contacts-heading" className="font-semibold text-zinc-900">
        View contacts
      </h2>
      {note && <p className="text-sm text-zinc-500">{note}</p>}
    </div>
  );
}

export function SegmentContactsTableSkeleton() {
  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b px-5 py-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-5 py-3 last:border-0">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="ml-auto h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
