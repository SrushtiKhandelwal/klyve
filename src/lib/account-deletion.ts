import "server-only";
import { APIError } from "better-auth/api";
import { db } from "@/lib/db";
import { parseStorageKey } from "@/lib/media/storage";

// Deleting your own account (Settings → Profile → Delete account).
//
// What happens to each workspace you're in:
// - You OWN it and nobody else is in it → it's deleted with everything in it
//   (contacts, campaigns, templates, uploaded images...).
// - You're an admin or member → you're simply removed; it carries on.
// - You OWN it and other people are in it → we STOP and ask you to remove
//   them first (Settings → Team). We never delete a workspace other people
//   still use, and ownership can't be handed over yet.
// - We also stop while one of the workspaces to be deleted is sending a
//   campaign, so the sender never works on rows that vanish under it.
//
// Your login, sessions and memberships go with the user row (database
// cascade). Records in workspaces that stay (e.g. "created by") keep only an
// internal id that no longer points at anyone.

export type NamedWorkspace = { id: string; name: string };

export type DeletionPlan = {
  /** Owned by you alone: deleted with everything in them. */
  deleteWorkspaces: NamedWorkspace[];
  /** You're an admin or member: you're removed, the workspace stays. */
  leaveWorkspaces: NamedWorkspace[];
  /** Must be sorted out before the account can be deleted. */
  blockers: { name: string; reason: string }[];
};

export async function getDeletionPlan(userId: string): Promise<DeletionPlan> {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          _count: { select: { members: true, campaigns: { where: { status: "SENDING" } } } },
        },
      },
    },
  });

  const plan: DeletionPlan = { deleteWorkspaces: [], leaveWorkspaces: [], blockers: [] };
  for (const { role, workspace } of memberships) {
    const named = { id: workspace.id, name: workspace.name };
    if (role !== "OWNER") {
      plan.leaveWorkspaces.push(named);
    } else if (workspace._count.members > 1) {
      plan.blockers.push({
        name: workspace.name,
        reason: "Other people use this workspace. Remove them under Settings → Team first.",
      });
    } else if (workspace._count.campaigns > 0) {
      plan.blockers.push({
        name: workspace.name,
        reason: "A campaign is sending right now. Pause or cancel it first.",
      });
    } else {
      plan.deleteWorkspaces.push(named);
    }
  }
  return plan;
}

/**
 * Runs inside Better Auth's delete-user step, AFTER the password check and
 * just BEFORE the user row is deleted (src/lib/auth.ts → beforeDelete).
 * Throwing here cancels the whole deletion.
 */
export async function deleteOwnedWorkspaces(userId: string): Promise<void> {
  const plan = await getDeletionPlan(userId);
  if (plan.blockers.length > 0) {
    throw new APIError("BAD_REQUEST", {
      code: "ACCOUNT_DELETION_BLOCKED",
      message: `Sort out ${plan.blockers.map((b) => `"${b.name}"`).join(", ")} first.`,
    });
  }

  for (const workspace of plan.deleteWorkspaces) {
    const files = await db.mediaAsset.findMany({ where: { workspaceId: workspace.id }, select: { storageKey: true } });

    // "every member is this user" re-checks, in the delete itself, that nobody
    // joined in the meantime. The database cascade removes everything inside.
    const { count } = await db.workspace.deleteMany({
      where: { id: workspace.id, members: { every: { userId } } },
    });
    if (count === 0) continue;

    // Then the uploaded image files on disk.
    for (const file of files) {
      try {
        const { storage, key } = parseStorageKey(file.storageKey);
        await storage.delete(key);
      } catch (error) {
        // The rows are gone, so nothing links to the file any more; a leftover
        // only wastes disk space. Log it rather than stopping the deletion.
        console.error("[delete-account] Could not remove a media file:", error);
      }
    }
  }
}
