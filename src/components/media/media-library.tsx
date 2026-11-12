"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ImageIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { deleteMedia, listMedia, type MediaItem } from "@/app/actions/media";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadDropzone } from "./upload-dropzone";
import { formatBytes, type UploadedMedia } from "./upload";

/** Warning shown before deleting: the public URL stops working. */
export const DELETE_WARNING = "Emails already sent that use this image will show a broken image.";

/**
 * The workspace's image library: an upload area plus a grid of images with
 * "Load more" and delete. Use it on its own (a media page) or inside the
 * MediaPicker dialog by passing `onSelect`.
 */
export function MediaLibrary({
  onSelect,
  onUploaded,
  className,
}: {
  /** When given, clicking an image picks it. */
  onSelect?: (item: MediaItem) => void;
  /** Called after each successful upload (the picker uses it to auto-select). */
  onUploaded?: (asset: UploadedMedia, info: { isLastOfBatch: boolean; batchSize: number }) => void;
  className?: string;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, startLoading] = useTransition();
  const [toDelete, setToDelete] = useState<MediaItem | null>(null);
  const [deleting, startDeleting] = useTransition();

  const loadPage = useCallback((cursor: string | null) => {
    startLoading(async () => {
      const result = await listMedia({ cursor });
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);
      // Append, skipping ids we already show (e.g. an image uploaded while this page loaded).
      setItems((current) => {
        const seen = new Set(current.map((i) => i.id));
        return [...current, ...result.items.filter((i) => !seen.has(i.id))];
      });
      setNextCursor(result.nextCursor);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    loadPage(null);
  }, [loadPage]);

  function handleUploaded(asset: UploadedMedia, info: { isLastOfBatch: boolean; batchSize: number }) {
    // Show it straight away at the top of the grid. The uploader can always delete their own image.
    const item: MediaItem = {
      ...asset,
      mimeType: "",
      createdAt: new Date().toISOString(),
      createdById: null,
      canDelete: true,
    };
    setItems((current) => [item, ...current.filter((c) => c.id !== asset.id)]);
    onUploaded?.(asset, info);
  }

  function confirmDelete() {
    const target = toDelete;
    if (!target) return;
    startDeleting(async () => {
      const result = await deleteMedia(target.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setItems((current) => current.filter((i) => i.id !== target.id));
      setToDelete(null);
      toast.success("Image deleted.");
    });
  }

  return (
    <div className={cn("grid gap-4", className)}>
      <UploadDropzone onUploaded={handleUploaded} />

      <section aria-label="Your images" className="grid gap-3">
        {!loaded && !loadError ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : loadError && items.length === 0 ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {loadError}{" "}
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => loadPage(null)}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center">
            <ImageIcon className="size-8 text-zinc-300" aria-hidden />
            <p className="mt-2 text-sm font-medium text-zinc-900">No images yet</p>
            <p className="text-xs text-zinc-500">Upload your logo or photos to use them in emails.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item) => (
              <MediaTile key={item.id} item={item} onSelect={onSelect} onDelete={() => setToDelete(item)} />
            ))}
          </ul>
        )}

        {nextCursor && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => loadPage(nextCursor)} disabled={loadingMore}>
              {loadingMore && <Loader2Icon className="animate-spin" />}
              Load more
            </Button>
          </div>
        )}
      </section>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && !deleting && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this image?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium break-all text-zinc-900">{toDelete?.fileName}</span> will be removed
              from your library. {DELETE_WARNING} This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2Icon className="animate-spin" />}
              Delete image
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MediaTile({
  item,
  onSelect,
  onDelete,
}: {
  item: MediaItem;
  onSelect?: (item: MediaItem) => void;
  onDelete: () => void;
}) {
  const dims = item.width && item.height ? `${item.width} × ${item.height}` : null;
  const thumbnail = (
    <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-[repeating-conic-gradient(#f4f4f5_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
      {/* Plain <img>: these are user uploads served from /media, no Next.js image optimisation needed. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt="" loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
    </span>
  );

  return (
    <li className="group relative grid gap-1.5 rounded-lg border bg-white p-1.5">
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(item)}
          aria-label={`Use ${item.fileName}${dims ? `, ${dims} pixels` : ""}`}
          className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/50 hover:opacity-90"
        >
          {thumbnail}
        </button>
      ) : (
        thumbnail
      )}
      <div className="flex min-w-0 items-start gap-1 px-0.5">
        <div className="grid min-w-0 flex-1">
          <span className="truncate text-xs font-medium text-zinc-800" title={item.fileName}>
            {item.fileName}
          </span>
          <span className="text-[11px] text-zinc-500">
            {[dims, formatBytes(item.sizeBytes)].filter(Boolean).join(" · ")}
          </span>
        </div>
        {item.canDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-zinc-500 hover:text-red-600"
            aria-label={`Delete ${item.fileName}`}
            onClick={onDelete}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>
    </li>
  );
}
