"use server";

import { refresh } from "next/cache";
import {
  createCampaignFolder,
  deleteCampaignFolder,
  moveCampaignToFolder,
  renameCampaignFolder,
  type FolderResult,
} from "@/lib/campaigns/folders";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for campaign folders on the Campaigns page.
// Anyone can call these with any input, so each one works out the workspace
// from the session; the data layer (folders.ts) validates everything and
// filters every query by that workspace.

const SERVER_ERROR = "Something went wrong. Please try again.";

async function run<T extends object>(name: string, work: () => Promise<FolderResult<T>>): Promise<FolderResult<T>> {
  try {
    const result = await work();
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error(`${name} failed:`, error);
    return { ok: false, error: SERVER_ERROR };
  }
}

/** New folder (any member). */
export async function createCampaignFolderAction(name: unknown): Promise<FolderResult<{ id: string; name: string }>> {
  const ws = await requireActiveWorkspace();
  return run("createCampaignFolderAction", () => createCampaignFolder(ws.id, name));
}

/** Rename a folder (any member). */
export async function renameCampaignFolderAction(folderId: unknown, name: unknown): Promise<FolderResult> {
  const ws = await requireActiveWorkspace();
  return run("renameCampaignFolderAction", () => renameCampaignFolder(ws.id, folderId, name));
}

/** Delete a folder (owners and admins). Its campaigns move to "No folder". */
export async function deleteCampaignFolderAction(folderId: unknown): Promise<FolderResult> {
  const ws = await requireActiveWorkspace();
  if (ws.role !== "OWNER" && ws.role !== "ADMIN") {
    return { ok: false, error: "Only workspace owners and admins can delete folders." };
  }
  return run("deleteCampaignFolderAction", () => deleteCampaignFolder(ws.id, folderId));
}

/** Move a campaign into a folder, or out of it (folderId null). Any member. */
export async function moveCampaignToFolderAction(campaignId: unknown, folderId: unknown): Promise<FolderResult> {
  const ws = await requireActiveWorkspace();
  return run("moveCampaignToFolderAction", () => moveCampaignToFolder(ws.id, campaignId, folderId));
}
