import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CONTACT_STATUSES, type ContactStatusValue } from "@/lib/contacts/common";

// Read helpers for the contacts table and the single-contact page.
// Every function takes a workspaceId and filters by it, so ONLY pass the id
// returned by requireActiveWorkspace(), never one that came from the browser.

/** How many contacts we show per page in the table. */
export const CONTACTS_PAGE_SIZE = 50;

export type ContactFilters = {
  /** Free-text search over email, first name and last name. */
  q?: string;
  status?: ContactStatusValue;
  /** Only contacts in this list. */
  listId?: string;
  /** 1-based page number. */
  page?: number;
};

/**
 * Turns the raw URL query (?q=&status=&list=&page=) into safe filters.
 * Anything unexpected is simply ignored, so a hand-edited URL can't break
 * the page.
 */
export function parseContactFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ContactFilters {
  // ?a=1&a=2 arrives as an array; we only use the first value.
  const first = (key: string) => {
    const value = searchParams[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
  };

  const q = first("q")?.slice(0, 200);
  const rawStatus = first("status")?.toUpperCase();
  const status = CONTACT_STATUSES.find((s) => s === rawStatus);
  const listId = first("list")?.slice(0, 64);
  const pageNumber = Number.parseInt(first("page") ?? "1", 10);
  const page = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  return { q, status, listId, page };
}

/** Builds the WHERE part of the query. Always starts with the workspace. */
function buildWhere(workspaceId: string, filters: ContactFilters): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { workspaceId };
  const and: Prisma.ContactWhereInput[] = [];

  if (filters.q) {
    // Every word must match the email, first name or last name, so
    // "priya sharma" finds Priya Sharma (first "priya" AND last "sharma").
    const words = filters.q.split(/\s+/).filter(Boolean).slice(0, 5);
    for (const word of words) {
      and.push({
        OR: [
          { email: { contains: word, mode: "insensitive" } },
          { firstName: { contains: word, mode: "insensitive" } },
          { lastName: { contains: word, mode: "insensitive" } },
        ],
      });
    }
  }

  if (filters.status) and.push({ status: filters.status });

  if (filters.listId) {
    // The list must ALSO be in this workspace (belt and braces).
    and.push({ lists: { some: { listId: filters.listId, list: { workspaceId } } } });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

const contactRowSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  createdAt: true,
  _count: { select: { lists: true } },
} satisfies Prisma.ContactSelect;

export type ContactRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: ContactStatusValue;
  createdAt: Date;
  listCount: number;
};

export type ContactListResult = {
  contacts: ContactRow[];
  /** Number of contacts matching the filters (across all pages). */
  total: number;
  /** The page actually shown (clamped to the last page). */
  page: number;
  pageCount: number;
};

/** One page of the workspace's contacts, newest first. */
export async function listContacts(
  workspaceId: string,
  filters: ContactFilters,
): Promise<ContactListResult> {
  const where = buildWhere(workspaceId, filters);

  const total = await db.contact.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE));
  // If someone asks for page 99 of 3, show the last page instead of nothing.
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);

  const rows = await db.contact.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * CONTACTS_PAGE_SIZE,
    take: CONTACTS_PAGE_SIZE,
    select: contactRowSelect,
  });

  return {
    contacts: rows.map(({ _count, ...row }) => ({ ...row, listCount: _count.lists })),
    total,
    page,
    pageCount,
  };
}

/** Total contacts in the workspace, ignoring filters (for the page header). */
export async function countContacts(workspaceId: string): Promise<number> {
  return db.contact.count({ where: { workspaceId } });
}

export type ContactDetail = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: ContactStatusValue;
  attributes: Prisma.JsonValue;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  lists: { id: string; name: string; addedAt: Date }[];
};

/**
 * One contact with the lists it belongs to, or null if it doesn't exist OR
 * belongs to another workspace (we never reveal which).
 */
export async function getContact(workspaceId: string, id: string): Promise<ContactDetail | null> {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;

  const contact = await db.contact.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      attributes: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      lists: {
        // Memberships should always be same-workspace, but filter anyway.
        where: { list: { workspaceId } },
        orderBy: { list: { name: "asc" } },
        select: { addedAt: true, list: { select: { id: true, name: true } } },
      },
    },
  });
  if (!contact) return null;

  return {
    ...contact,
    lists: contact.lists.map((m) => ({ id: m.list.id, name: m.list.name, addedAt: m.addedAt })),
  };
}
