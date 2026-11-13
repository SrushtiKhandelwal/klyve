import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Campaign folders (like Brevo's "Create folder"): a simple way to group
// campaigns on the Campaigns page. Only REGULAR campaigns go in folders.
// Deleting a folder never deletes campaigns: the database moves them back to
// "No folder" (Campaign.folderId is set to null, onDelete: SetNull).
//
// SECURITY: every function takes the workspace id FIRST (only ever pass the
// one from requireActiveWorkspace()) and every query filters by it, so a
// folder or campaign id from another workspace simply finds nothing.

export const FOLDER_LIMITS = { nameMax: 50, maxFolders: 100 } as const;

export type FolderResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const FOLDER_NOT_FOUND = "This folder doesn't exist (or was deleted).";
const CAMPAIGN_NOT_FOUND = "This campaign doesn't exist (or was deleted).";

const cleanId = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null);
const noControlChars = (v: string) => ![...v].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f);

export const folderNameSchema = z
  .string()
  .trim()
  .min(1, "Give the folder a name.")
  .max(FOLDER_LIMITS.nameMax, `Keep the folder name under ${FOLDER_LIMITS.nameMax + 1} characters.`)
  .refine(noControlChars, "The folder name can't contain line breaks.");

const nameTaken = (name: string) => `You already have a folder called “${name}”. Pick another name.`;

// ── Reading ─────────────────────────────────────────────────────────────────

export type CampaignFolderView = { id: string; name: string; count: number };

export type FolderOverview = {
  /** Every folder, A→Z, with how many campaigns are in it. */
  folders: CampaignFolderView[];
  /** All regular campaigns, and those in no folder. */
  total: number;
  unfiled: number;
};

/** The folder list for the Campaigns page (two small queries). */
export async function listCampaignFolders(workspaceId: string): Promise<FolderOverview> {
  const [folders, counts] = await Promise.all([
    db.campaignFolder.findMany({
      where: { workspaceId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: FOLDER_LIMITS.maxFolders,
      select: { id: true, name: true },
    }),
    db.campaign.groupBy({
      by: ["folderId"],
      where: { workspaceId, kind: "REGULAR" },
      _count: { _all: true },
    }),
  ]);
  const byFolder = new Map(counts.map((c) => [c.folderId, c._count._all]));
  return {
    folders: folders.map((f) => ({ ...f, count: byFolder.get(f.id) ?? 0 })),
    total: counts.reduce((n, c) => n + c._count._all, 0),
    unfiled: byFolder.get(null) ?? 0,
  };
}

/** True when `folderId` is a folder of this workspace. */
export async function folderExists(workspaceId: string, folderId: string): Promise<boolean> {
  const id = cleanId(folderId);
  if (!id) return false;
  return (await db.campaignFolder.count({ where: { id, workspaceId } })) > 0;
}

// ── Writing ─────────────────────────────────────────────────────────────────

/** Is the name already used in this workspace (ignoring upper/lower case)? */
async function isNameTaken(workspaceId: string, name: string, exceptId?: string): Promise<boolean> {
  const clash = await db.campaignFolder.findFirst({
    where: { workspaceId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return clash !== null;
}

const isUniqueClash = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export async function createCampaignFolder(workspaceId: string, rawName: unknown): Promise<FolderResult<{ id: string; name: string }>> {
  const parsed = folderNameSchema.safeParse(rawName);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That name isn't valid." };
  const name = parsed.data;

  const count = await db.campaignFolder.count({ where: { workspaceId } });
  if (count >= FOLDER_LIMITS.maxFolders) {
    return { ok: false, error: `You can have up to ${FOLDER_LIMITS.maxFolders} folders. Delete one you don't use first.` };
  }
  if (await isNameTaken(workspaceId, name)) return { ok: false, error: nameTaken(name) };

  try {
    const folder = await db.campaignFolder.create({ data: { workspaceId, name }, select: { id: true, name: true } });
    return { ok: true, ...folder };
  } catch (error) {
    // Two people created the same name at the same moment: the database's unique rule decides.
    if (isUniqueClash(error)) return { ok: false, error: nameTaken(name) };
    throw error;
  }
}

export async function renameCampaignFolder(workspaceId: string, folderId: unknown, rawName: unknown): Promise<FolderResult> {
  const id = cleanId(folderId);
  if (!id) return { ok: false, error: FOLDER_NOT_FOUND };
  const parsed = folderNameSchema.safeParse(rawName);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That name isn't valid." };
  const name = parsed.data;

  if (await isNameTaken(workspaceId, name, id)) return { ok: false, error: nameTaken(name) };
  try {
    // updateMany + workspaceId: another workspace's folder is never renamed.
    const result = await db.campaignFolder.updateMany({ where: { id, workspaceId }, data: { name } });
    return result.count === 1 ? { ok: true } : { ok: false, error: FOLDER_NOT_FOUND };
  } catch (error) {
    if (isUniqueClash(error)) return { ok: false, error: nameTaken(name) };
    throw error;
  }
}

/** Deletes the folder. Its campaigns stay, in "No folder". */
export async function deleteCampaignFolder(workspaceId: string, folderId: unknown): Promise<FolderResult> {
  const id = cleanId(folderId);
  if (!id) return { ok: false, error: FOLDER_NOT_FOUND };
  const result = await db.campaignFolder.deleteMany({ where: { id, workspaceId } });
  return result.count === 1 ? { ok: true } : { ok: false, error: FOLDER_NOT_FOUND };
}

/** Puts a regular campaign in a folder of this workspace (null = "No folder"). */
export async function moveCampaignToFolder(workspaceId: string, campaignId: unknown, folderId: unknown): Promise<FolderResult> {
  const id = cleanId(campaignId);
  if (!id) return { ok: false, error: CAMPAIGN_NOT_FOUND };

  let target: string | null = null;
  if (folderId !== null && folderId !== "") {
    target = cleanId(folderId);
    if (!target || !(await folderExists(workspaceId, target))) return { ok: false, error: FOLDER_NOT_FOUND };
  }
  // Any status may be moved: a folder is only for tidying the list.
  const result = await db.campaign.updateMany({ where: { id, workspaceId, kind: "REGULAR" }, data: { folderId: target } });
  return result.count === 1 ? { ok: true } : { ok: false, error: CAMPAIGN_NOT_FOUND };
}
