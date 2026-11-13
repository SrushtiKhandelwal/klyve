import "server-only";
import { db } from "@/lib/db";
import { listTransactionalEmails } from "@/lib/transactional/queries";
import type { TransactionalStatusName } from "@/lib/transactional/schema";
import type { EmailRowView, LogFilters } from "@/components/transactional/types";

// Data for the Transactional logs list, shared by the page (first page) and
// the "Load more" Server Action (next pages), so both build rows the same way.
// The workspace id MUST come from requireActiveWorkspace(), never the browser.

export const PAGE_SIZE = 25;

/** One page of log rows, with each email's API key name added. */
export async function loadEmailRows(
  workspaceId: string,
  filters: LogFilters,
  cursor: string | null,
): Promise<{ rows: EmailRowView[]; nextCursor: string | null }> {
  const page = await listTransactionalEmails(workspaceId, {
    limit: PAGE_SIZE,
    cursor,
    status: filters.status,
    apiKeyId: filters.key,
    to: filters.to,
    tag: filters.tag,
  });
  if (page.data.length === 0) return { rows: [], nextCursor: page.nextCursor };

  // The public email object doesn't say which key sent it, so look that up
  // for just these rows (filtered by workspace as well, as always).
  const extras = await db.transactionalEmail.findMany({
    where: { workspaceId, id: { in: page.data.map((e) => e.id) } },
    select: { id: true, source: true, apiKey: { select: { name: true } } },
  });
  const byId = new Map(extras.map((x) => [x.id, x]));

  const rows: EmailRowView[] = page.data.map((e) => {
    const extra = byId.get(e.id);
    return {
      id: e.id,
      toEmail: e.to.email,
      toName: e.to.name ?? null,
      subject: e.subject,
      status: e.status.toUpperCase() as TransactionalStatusName,
      tags: e.tags,
      keyName: extra?.apiKey?.name ?? null,
      fromDashboard: extra?.source === "dashboard",
      createdAt: e.createdAt,
    };
  });
  return { rows, nextCursor: page.nextCursor };
}

/** The workspace's keys for the filter dropdown (no secrets: name only). */
export async function listKeyChoices(workspaceId: string) {
  return db.apiKey.findMany({
    where: { workspaceId },
    orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    select: { id: true, name: true, revokedAt: true },
  });
}
