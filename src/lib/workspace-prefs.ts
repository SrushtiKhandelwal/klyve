import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { normalizeDatePrefs, type DatePrefs } from "@/lib/format-date";

/**
 * The workspace's date/time preferences (General settings), looked up once
 * per request. Pass the id of a workspace the caller has ALREADY checked
 * access to (e.g. from requireActiveWorkspace()).
 */
export const getWorkspaceDatePrefs = cache(async (workspaceId: string): Promise<DatePrefs> => {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { timezone: true, dateFormat: true, timeFormat: true },
  });
  return normalizeDatePrefs(ws);
});
