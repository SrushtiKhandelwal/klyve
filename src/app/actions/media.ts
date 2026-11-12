"use server";

import { deleteMediaAsset, findWorkspaceAsset, listMediaAssets, mediaUrl, type MediaAssetView } from "@/lib/media/assets";
import { clearLogoIfMatches } from "@/lib/brand-kit";
import { getCurrentUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for the media library. Uploading is NOT here: files go to
// POST /api/media (a Route Handler), which can stream and size-check them.
// Anyone can call these actions with any input, so each one works out the
// workspace from the session and never trusts ids without it.

export type MediaItem = MediaAssetView & {
  /** Whether the current user may delete it (owner/admin, or whoever uploaded it). */
  canDelete: boolean;
};

export type ListMediaResult =
  | { ok: true; items: MediaItem[]; nextCursor: string | null }
  | { ok: false; error: string };

/** One page of the workspace's images, newest first. Any member may look. */
export async function listMedia(input?: { cursor?: unknown }): Promise<ListMediaResult> {
  const ws = await requireActiveWorkspace();
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const cursor = typeof input?.cursor === "string" && input.cursor.length <= 64 ? input.cursor : null;
  try {
    const page = await listMediaAssets(ws.id, cursor);
    const isManager = ws.role === "OWNER" || ws.role === "ADMIN";
    return {
      ok: true,
      nextCursor: page.nextCursor,
      items: page.items.map((item) => ({ ...item, canDelete: isManager || item.createdById === user.id })),
    };
  } catch (error) {
    console.error("listMedia failed:", error);
    return { ok: false, error: "Couldn't load your images. Please try again." };
  }
}

export type DeleteMediaResult = { ok: true } | { ok: false; error: string };

/**
 * Deletes an image (owner/admin, or the person who uploaded it).
 * Emails already sent that use it will show a broken image from now on.
 */
export async function deleteMedia(id: unknown): Promise<DeleteMediaResult> {
  const ws = await requireActiveWorkspace();
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (typeof id !== "string" || id.length > 64) return { ok: false, error: "Image not found." };

  try {
    // Looked up WITH the workspace id: another workspace's image is "not found".
    const asset = await findWorkspaceAsset(ws.id, id);
    if (!asset) return { ok: false, error: "Image not found." };

    const isManager = ws.role === "OWNER" || ws.role === "ADMIN";
    if (!isManager && asset.createdById !== user.id) {
      return { ok: false, error: "Only owners, admins or the person who uploaded it can delete this image." };
    }

    const deleted = await deleteMediaAsset(ws.id, asset.id);
    if (!deleted) return { ok: false, error: "Image not found." };
    // If it was the brand logo, forget it so the brand kit doesn't point at a 404.
    await clearLogoIfMatches(ws.id, mediaUrl(asset.id));
    return { ok: true };
  } catch (error) {
    console.error("deleteMedia failed:", error);
    return { ok: false, error: "Couldn't delete the image. Please try again." };
  }
}
