import "server-only";
import { db } from "@/lib/db";
import type { AttributeTypeValue } from "@/lib/contacts/common";

// Small read helpers several Contacts screens need (dropdowns, forms).
// They take a workspaceId, so ONLY pass the id from requireActiveWorkspace().

export type ListOption = { id: string; name: string };

/** All lists in the workspace, A→Z, for dropdowns and pickers. */
export async function getListOptions(workspaceId: string): Promise<ListOption[]> {
  return db.contactList.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export type AttributeDefinition = {
  id: string;
  key: string;
  label: string;
  type: AttributeTypeValue;
};

/** The workspace's custom fields, oldest first (the order users created them). */
export async function getAttributeDefinitions(
  workspaceId: string,
): Promise<AttributeDefinition[]> {
  return db.contactAttribute.findMany({
    where: { workspaceId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, key: true, label: true, type: true },
  });
}
