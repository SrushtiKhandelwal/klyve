import "server-only";
import type { ContactStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Read helpers for contact lists.
//
// SECURITY: every function takes a `workspaceId` and filters by it. ONLY pass
// the id returned by requireActiveWorkspace(), never one from the browser.
// A list id from the URL is fine to pass as `listId`: because we also filter
// by workspaceId, a list from another workspace is simply "not found".

/** How many members we show per page on a list's page. */
export const LIST_MEMBERS_PAGE_SIZE = 50;

export type ListWithCounts = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  /** Everyone in the list, whatever their status. */
  totalMembers: number;
  /** Members a campaign would actually reach (status SUBSCRIBED). */
  subscribedMembers: number;
};

/** All lists in the workspace (newest first), each with its member counts. */
export async function getListsWithCounts(workspaceId: string): Promise<ListWithCounts[]> {
  // Two small queries instead of loading members:
  //  1. the lists, with the database counting all members (`_count`)
  //  2. one GROUP BY that counts only SUBSCRIBED members, per list
  const [lists, subscribedCounts] = await Promise.all([
    db.contactList.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        // The extra contact filter is a safety net: only count contacts that
        // belong to this same workspace.
        _count: { select: { members: { where: { contact: { workspaceId } } } } },
      },
    }),
    db.listMembership.groupBy({
      by: ["listId"],
      where: {
        list: { workspaceId },
        contact: { workspaceId, status: "SUBSCRIBED" },
      },
      _count: { _all: true },
    }),
  ]);

  const subscribedByList = new Map(subscribedCounts.map((row) => [row.listId, row._count._all]));

  return lists.map((list) => ({
    id: list.id,
    name: list.name,
    description: list.description,
    createdAt: list.createdAt,
    totalMembers: list._count.members,
    subscribedMembers: subscribedByList.get(list.id) ?? 0,
  }));
}

/** One list with its counts, or null if it doesn't exist in this workspace. */
export async function getList(
  workspaceId: string,
  listId: string,
): Promise<ListWithCounts | null> {
  const list = await db.contactList.findFirst({
    where: { id: listId, workspaceId },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      _count: { select: { members: { where: { contact: { workspaceId } } } } },
    },
  });
  if (!list) return null;

  const subscribedMembers = await db.listMembership.count({
    where: { listId: list.id, contact: { workspaceId, status: "SUBSCRIBED" } },
  });

  return {
    id: list.id,
    name: list.name,
    description: list.description,
    createdAt: list.createdAt,
    totalMembers: list._count.members,
    subscribedMembers,
  };
}

export type ListMember = {
  id: string; // the contact's id
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: ContactStatus;
  /** When the contact was added to THIS list. */
  addedAt: Date;
};

export type ListMembersPage = {
  members: ListMember[];
  /** How many members match the search (across all pages). */
  total: number;
  /** The page actually shown (1-based, clamped to what exists). */
  page: number;
  /** At least 1, even when there are no members. */
  pageCount: number;
};

/**
 * One page of a list's members, newest additions first.
 * `q` searches email, first name and last name. Each word must match, so
 * "priya sharma" finds Priya Sharma.
 */
export async function getListMembers(
  workspaceId: string,
  listId: string,
  { q, page }: { q?: string; page?: number },
): Promise<ListMembersPage> {
  const words = (q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);

  const contactFilter: Prisma.ContactWhereInput = {
    workspaceId,
    AND: words.map((word) => ({
      OR: [
        { email: { contains: word, mode: "insensitive" } },
        { firstName: { contains: word, mode: "insensitive" } },
        { lastName: { contains: word, mode: "insensitive" } },
      ],
    })),
  };

  // Both the list AND the contact must belong to this workspace.
  const where: Prisma.ListMembershipWhereInput = {
    listId,
    list: { workspaceId },
    contact: contactFilter,
  };

  const total = await db.listMembership.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / LIST_MEMBERS_PAGE_SIZE));
  // ?page=999 or ?page=-3 shouldn't break the page: show the nearest real page.
  const safePage = Math.min(Math.max(1, Math.floor(page ?? 1) || 1), pageCount);

  const rows = await db.listMembership.findMany({
    where,
    orderBy: [{ addedAt: "desc" }, { contactId: "asc" }],
    skip: (safePage - 1) * LIST_MEMBERS_PAGE_SIZE,
    take: LIST_MEMBERS_PAGE_SIZE,
    select: {
      addedAt: true,
      contact: {
        select: { id: true, email: true, firstName: true, lastName: true, status: true },
      },
    },
  });

  return {
    members: rows.map((row) => ({ ...row.contact, addedAt: row.addedAt })),
    total,
    page: safePage,
    pageCount,
  };
}
