import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { MAX_ASSETS_PER_WORKSPACE, MAX_BYTES_PER_WORKSPACE, UPLOAD_ERRORS, UPLOAD_RATE_LIMIT } from "./limits";
import { createRateLimiter } from "./rate-limit";
import { buildStorageKey, mediaStorage, parseStorageKey, toStorageKey } from "./storage";
import { sanitizeFileName, type ValidImage } from "./validate";

// The media library's data layer. Every function that touches a workspace's
// images takes the workspace id FIRST and always filters by it, so an id from
// another workspace simply finds nothing.

/** What the browser gets for each image. */
export type MediaAssetView = {
  id: string;
  /** Relative public URL ("/media/<id>"). The email renderer makes it absolute. */
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  createdById: string | null;
};

export const mediaUrl = (id: string) => `/media/${id}`;

/**
 * New asset ids: 128 random bits as hex (32 characters). Images are served
 * WITHOUT login (email apps must fetch them), so the id is the only thing
 * standing between a stranger and a workspace's images. Prisma's default
 * cuid() is partly made of a timestamp and counter, so we use a fully random
 * id instead. It still fits the editor's mediaId limit (40 characters).
 */
export function newAssetId(): string {
  return randomBytes(16).toString("hex");
}

/** Ids we accept in URLs: our hex ids or cuids. Anything else is a 404 without a DB query. */
export function isPlausibleAssetId(id: string): boolean {
  return /^[a-z0-9]{20,40}$/.test(id);
}

const viewSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  createdAt: true,
  createdById: true,
} as const;

function toView(row: {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
  createdById: string | null;
}): MediaAssetView {
  return { ...row, url: mediaUrl(row.id), createdAt: row.createdAt.toISOString() };
}

// ── Limits ───────────────────────────────────────────────────────────────────

// Kept on globalThis so it survives hot reloads in development.
const globalForMedia = globalThis as unknown as { mediaUploadLimiter?: ReturnType<typeof createRateLimiter> };
export const uploadRateLimiter = (globalForMedia.mediaUploadLimiter ??= createRateLimiter(UPLOAD_RATE_LIMIT));

/**
 * Checks the workspace's quota (500 images / 500 MB) has room for one more file.
 * Note: two uploads finishing at the very same moment could both pass and go
 * one file over. That's acceptable: the per-user rate limit keeps it tiny.
 */
export async function checkQuota(workspaceId: string, incomingBytes: number): Promise<string | null> {
  const usage = await db.mediaAsset.aggregate({
    where: { workspaceId },
    _count: { _all: true },
    _sum: { sizeBytes: true },
  });
  if (usage._count._all >= MAX_ASSETS_PER_WORKSPACE) return UPLOAD_ERRORS.quotaCount;
  if ((usage._sum.sizeBytes ?? 0) + incomingBytes > MAX_BYTES_PER_WORKSPACE) return UPLOAD_ERRORS.quotaBytes;
  return null;
}

/** How much of the quota a workspace uses (for the Media page's storage meter). */
export async function getMediaUsage(workspaceId: string): Promise<{ count: number; bytes: number }> {
  const usage = await db.mediaAsset.aggregate({
    where: { workspaceId },
    _count: { _all: true },
    _sum: { sizeBytes: true },
  });
  return { count: usage._count._all, bytes: usage._sum.sizeBytes ?? 0 };
}

// ── Create / list / delete ───────────────────────────────────────────────────

/** Saves the (already validated) bytes, then the database row. */
export async function createMediaAsset(input: {
  workspaceId: string;
  userId: string;
  originalName: string;
  bytes: Uint8Array;
  image: ValidImage;
}): Promise<MediaAssetView> {
  const id = newAssetId();
  // The file name on disk is built from OUR ids and the REAL type, never the
  // uploaded name, so nobody can choose where it goes or what it's called.
  const key = buildStorageKey(input.workspaceId, id, input.image.ext);

  await mediaStorage.put(key, input.bytes, input.image.mime);
  try {
    const row = await db.mediaAsset.create({
      data: {
        id,
        workspaceId: input.workspaceId,
        fileName: sanitizeFileName(input.originalName, input.image.ext),
        mimeType: input.image.mime,
        sizeBytes: input.bytes.byteLength,
        width: input.image.width,
        height: input.image.height,
        storageKey: toStorageKey(key),
        createdById: input.userId,
      },
      select: viewSelect,
    });
    return toView(row);
  } catch (error) {
    // Don't leave an orphan file behind if the database refused the row.
    await mediaStorage.delete(key).catch(() => {});
    throw error;
  }
}

export const MEDIA_PAGE_SIZE = 24;

/** One page of a workspace's images, newest first. `cursor` = last id of the previous page. */
export async function listMediaAssets(
  workspaceId: string,
  cursor?: string | null,
): Promise<{ items: MediaAssetView[]; nextCursor: string | null }> {
  // Resolve the cursor INSIDE this workspace, so a cursor from another
  // workspace can't be used to page through its images.
  const after = cursor
    ? await db.mediaAsset.findFirst({ where: { id: cursor, workspaceId }, select: { id: true, createdAt: true } })
    : null;

  const rows = await db.mediaAsset.findMany({
    where: {
      workspaceId,
      ...(after && {
        OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }],
      }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MEDIA_PAGE_SIZE + 1, // one extra tells us whether there's another page
    select: viewSelect,
  });

  const hasMore = rows.length > MEDIA_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, MEDIA_PAGE_SIZE) : rows;
  return { items: page.map(toView), nextCursor: hasMore ? page[page.length - 1].id : null };
}

export async function findWorkspaceAsset(workspaceId: string, id: string) {
  return db.mediaAsset.findFirst({ where: { id, workspaceId }, select: { ...viewSelect, storageKey: true } });
}

/**
 * Deletes the row, then the file. Emails that were already sent keep pointing
 * at /media/<id>, which will now show a broken image (the UI warns about this).
 */
export async function deleteMediaAsset(workspaceId: string, id: string): Promise<boolean> {
  const asset = await findWorkspaceAsset(workspaceId, id);
  if (!asset) return false;

  // deleteMany + workspaceId = can never delete another workspace's row.
  const { count } = await db.mediaAsset.deleteMany({ where: { id: asset.id, workspaceId } });
  if (count === 0) return false;

  try {
    const { storage, key } = parseStorageKey(asset.storageKey);
    await storage.delete(key);
  } catch (error) {
    // The row is gone, so the image already 404s. A leftover file only wastes
    // disk space; log it rather than failing the delete.
    console.error("Could not remove media file:", error);
  }
  return true;
}

/** For the public /media/<id> route: no workspace check on purpose (see that route). */
export async function findPublicAsset(id: string) {
  if (!isPlausibleAssetId(id)) return null;
  return db.mediaAsset.findUnique({
    where: { id },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, storageKey: true },
  });
}
